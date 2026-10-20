import { readFiles } from 'promptbook-project';
import type { Db } from '../db.js';
import { loadProjectDoc } from '../projects.js';
import type { BlobStore } from './blobs.js';

// The daily sweep of the file store (asset-board design decision 6): a
// project keeps its link to a file while its stored document lists it, and
// for the grace period after; a file no project links is deleted.

const DAY_MS = 86_400_000;
// A blob written this recently may belong to an upload whose rows are not
// committed yet: its bytes wait for a later sweep.
const IN_FLIGHT_MS = 3_600_000;

const FOREIGN_KEY_VIOLATION = '23503';

export interface Swept {
  // Links whose document lists the file again.
  relisted: number;
  // Links whose document stopped listing the file.
  unreferenced: number;
  // Links dropped after the grace period.
  dropped: number;
  // Files no project links, with their bytes.
  files: number;
  // Bytes with no row, and temporary files, older than a day.
  orphans: number;
  temp: number;
}

export async function sweepFiles(db: Db, blobs: BlobStore, { graceDays }: { graceDays: number }): Promise<Swept> {
  const swept: Swept = { relisted: 0, unreferenced: 0, dropped: 0, files: 0, orphans: 0, temp: 0 };

  // 1. Each project's links against what its stored document lists, the
  // thumbnails included.
  const projects = await db.query<{ project_id: string }>('select distinct project_id from project_files');
  for (const { project_id: projectId } of projects) {
    const doc = await loadProjectDoc(db, projectId);
    // No stored document to read: nothing can be said about its links.
    if (!doc) continue;
    const listed = [...new Set(readFiles(doc).flatMap((f) => (f.thumbSha256 ? [f.sha256, f.thumbSha256] : [f.sha256])))];
    doc.destroy();
    const relisted = await db.query(
      `update project_files set unreferenced_since = null
       where project_id = $1 and sha256 = any($2::text[]) and unreferenced_since is not null returning sha256`,
      [projectId, listed],
    );
    const dropped = await db.query(
      `delete from project_files
       where project_id = $1 and not (sha256 = any($2::text[]))
         and unreferenced_since < now() - make_interval(days => $3) returning sha256`,
      [projectId, listed, graceDays],
    );
    const unreferenced = await db.query(
      `update project_files set unreferenced_since = now()
       where project_id = $1 and not (sha256 = any($2::text[])) and unreferenced_since is null returning sha256`,
      [projectId, listed],
    );
    swept.relisted += relisted.length;
    swept.dropped += dropped.length;
    swept.unreferenced += unreferenced.length;
  }

  // 2. Files no project links, one at a time: an upload linking one again
  // meanwhile makes its delete fail, and it stays.
  const unlinked = await db.query<{ sha256: string }>(
    'select sha256 from files f where not exists (select 1 from project_files pf where pf.sha256 = f.sha256)',
  );
  const recent = new Set<string>();
  for await (const blob of blobs.list()) if (blob.mtimeMs > Date.now() - IN_FLIGHT_MS) recent.add(blob.sha256);
  for (const { sha256 } of unlinked) {
    try {
      const deleted = await db.query(
        `delete from files f where sha256 = $1
         and not exists (select 1 from project_files pf where pf.sha256 = f.sha256) returning sha256`,
        [sha256],
      );
      if (deleted.length === 0) continue;
    } catch (error) {
      if ((error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) continue;
      throw error;
    }
    swept.files++;
    // Written again by an upload in the meantime: step 3 has it tomorrow if
    // that upload never commits.
    if (!recent.has(sha256)) await blobs.delete(sha256);
  }

  // 3. Bytes with no row, older than a day: a stop between the move into
  // place and the commit. Then the temporary files of uploads cut short.
  const old: string[] = [];
  for await (const blob of blobs.list()) if (blob.mtimeMs < Date.now() - DAY_MS) old.push(blob.sha256);
  const known = new Set(
    (await db.query<{ sha256: string }>('select sha256 from files where sha256 = any($1::text[])', [old])).map(
      (r) => r.sha256,
    ),
  );
  for (const sha256 of old) {
    if (known.has(sha256)) continue;
    await blobs.delete(sha256);
    swept.orphans++;
  }
  swept.temp = await blobs.clearTemp(DAY_MS);
  return swept;
}
