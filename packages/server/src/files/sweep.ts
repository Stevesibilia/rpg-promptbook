import { fileHashes } from 'promptbook-project';
import type { Db } from '../db.js';
import { loadProjectDoc } from '../projects.js';
import type { BlobStore } from './blobs.js';
import { lockContent } from './store.js';

// The daily sweep of the file store (asset-board design decision 6): a
// project keeps its link to a file while its stored document lists it, and
// for the grace period after; a file no project links is deleted.

const DAY_MS = 86_400_000;

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
    const listed = [...fileHashes(doc)];
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

  // 2. Files no project links, with their bytes. Each one under its
  // content's lock (store.ts): an upload linking it meanwhile either commits
  // first, and the file stays, or finds the bytes gone and answers retry.
  const unlinked = await db.query<{ sha256: string }>(
    'select sha256 from files f where not exists (select 1 from project_files pf where pf.sha256 = f.sha256)',
  );
  for (const { sha256 } of unlinked) {
    const deleted = await db.withTransaction(async (tx) => {
      await lockContent(tx, sha256);
      const rows = await tx.query(
        `delete from files f where sha256 = $1
         and not exists (select 1 from project_files pf where pf.sha256 = f.sha256) returning sha256`,
        [sha256],
      );
      if (rows.length > 0) await blobs.delete(sha256);
      return rows.length > 0;
    });
    if (deleted) swept.files++;
  }

  // 3. Bytes with no row, older than a day: a stop between the move into
  // place and the commit, or an upload past the quota. Looked for again
  // under the content's lock, as in step 2.
  const old: string[] = [];
  for await (const blob of blobs.list()) if (blob.mtimeMs < Date.now() - DAY_MS) old.push(blob.sha256);
  const known = new Set(
    (await db.query<{ sha256: string }>('select sha256 from files where sha256 = any($1::text[])', [old])).map(
      (r) => r.sha256,
    ),
  );
  for (const sha256 of old) {
    if (known.has(sha256)) continue;
    const removed = await db.withTransaction(async (tx) => {
      await lockContent(tx, sha256);
      if (await tx.queryOne('select 1 from files where sha256 = $1', [sha256])) return false;
      await blobs.delete(sha256);
      return true;
    });
    if (removed) swept.orphans++;
  }
  swept.temp = await blobs.clearTemp(DAY_MS);
  return swept;
}
