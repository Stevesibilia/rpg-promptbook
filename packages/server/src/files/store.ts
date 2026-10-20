import type { Db, Queryable } from '../db.js';

// The files and project_files tables (asset-board design decision 4): which
// contents the server holds, and which project links which of them.

export interface StoredFile {
  sha256: string;
  size: number;
  mime: string;
}

const FOREIGN_KEY_VIOLATION = '23503';

// The file as the project links it, or null when it does not.
export async function linkedFile(db: Queryable, projectId: string, sha256: string): Promise<StoredFile | null> {
  const row = await db.queryOne<{ sha256: string; size: string; mime: string }>(
    `select f.sha256, f.size, f.mime from project_files pf join files f using (sha256)
     where pf.project_id = $1 and pf.sha256 = $2`,
    [projectId, sha256],
  );
  return row ? { sha256: row.sha256, size: Number(row.size), mime: row.mime } : null;
}

// Whether `length` more bytes of this content fit in the user's quota: their
// projects' files, each content counted once, the bin's included since its
// files are still stored. A content one of their projects already links
// costs nothing more.
export async function fitsQuota(
  db: Queryable,
  userId: string,
  sha256: string,
  length: number,
  quotaBytes: number,
): Promise<boolean> {
  const row = await db.queryOne<{ used: string; has: boolean | null }>(
    `select coalesce(sum(f.size), 0) as used, bool_or(f.sha256 = $2) as has
     from files f
     where f.sha256 in (
       select pf.sha256 from project_files pf join projects p on p.id = pf.project_id where p.owner_id = $1
     )`,
    [userId, sha256],
  );
  if (row?.has) return true;
  return Number(row?.used ?? 0) + length <= quotaBytes;
}

// Records a stored content and links it to the project, in one transaction.
// The sweep may remove the content's row between the move into place and
// this; the link then fails its foreign key, and the row is written again.
export async function linkFile(db: Db, projectId: string, file: StoredFile, userId: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await db.withTransaction(async (tx) => {
        await tx.query(
          `insert into files (sha256, size, mime, created_by) values ($1, $2, $3, $4) on conflict (sha256) do nothing`,
          [file.sha256, file.size, file.mime, userId],
        );
        await tx.query(
          `insert into project_files (project_id, sha256) values ($1, $2) on conflict (project_id, sha256) do nothing`,
          [projectId, file.sha256],
        );
      });
      return;
    } catch (error) {
      if ((error as { code?: unknown }).code !== FOREIGN_KEY_VIOLATION || attempt > 0) throw error;
    }
  }
}
