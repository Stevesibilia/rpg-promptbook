import { projectRow, readMeta, summarize, type CampaignRef, type ProjectRow } from 'promptbook-project';
import type { ServerClient } from './server.js';
import type { ProjectRecord, Store } from './store.js';
import { cachedTemplates } from './templates.js';
import type { SyncEngine } from './sync.js';

// The projects list on this device (desktop-app design decisions 7 and 10).
// Rows are built from each document with the shared summary, the server's
// campaign rule and the dates the server last listed. When online the
// server's list is read at start, on reconnect, every 5 minutes and when
// asked: a project new on the server gets a row and a provider, one missing
// from it leaves the list (kept in the store), one back in it returns.

export const LIST_EVERY_MS = 5 * 60_000;
export const PURGE_AFTER_MS = 30 * 86_400_000;
const SUMMARY_DELAY_MS = 1_000;

const byEdited = (a: ProjectRow, b: ProjectRow) =>
  a.editedAt === b.editedAt ? (a.id < b.id ? -1 : 1) : a.editedAt < b.editedAt ? 1 : -1;

export class ProjectList {
  private timers = new Map<string, { timer: ReturnType<typeof setTimeout>; local: boolean }>();
  private listing: Promise<void> | null = null;
  private closed = false;

  constructor(
    private readonly store: Store,
    private readonly engine: SyncEngine,
    private readonly server: () => ServerClient | null,
    private readonly now: () => number = Date.now,
  ) {}

  // The list GET /api/projects answers: not in the bin, newest edit first.
  rows(): ProjectRow[] {
    return this.store
      .listProjects()
      .filter((p) => p.deletedAt === null)
      .map((p) => p.row)
      .sort(byEdited);
  }

  // The user's campaigns not in the bin.
  campaigns(): CampaignRef[] {
    return this.store
      .listProjects()
      .filter((p) => p.deletedAt === null && p.row.category === 'campaign')
      .map((p) => ({ id: p.id, title: p.row.title }));
  }

  // A document changed: its row is built again in a moment.
  docChanged(id: string, local: boolean): void {
    if (this.closed) return;
    const pending = this.timers.get(id);
    if (pending) clearTimeout(pending.timer);
    const wasLocal = local || !!pending?.local;
    const timer = setTimeout(() => {
      this.timers.delete(id);
      this.refreshRow(id, wasLocal);
    }, SUMMARY_DELAY_MS);
    this.timers.set(id, { timer, local: wasLocal });
  }

  // The row of a project from its document as main holds it. A local edit
  // moves its editedAt to now.
  refreshRow(id: string, local = false): void {
    if (this.closed) return;
    const record = this.store.getProject(id);
    const doc = this.engine.doc(id);
    if (!record || !doc || !this.engine.isDownloaded(id) || readMeta(doc).id !== id) return;
    let summary;
    try {
      summary = summarize(doc, { campaigns: this.campaigns(), templates: cachedTemplates(this.store) });
    } catch {
      return;
    }
    const editedAt = local ? new Date(this.now()).toISOString() : record.row.editedAt;
    const row = projectRow(
      summary,
      { createdAt: record.row.createdAt, editedAt, deletedAt: record.deletedAt },
      this.campaigns(),
    );
    if (JSON.stringify(row) === JSON.stringify(record.row)) return;
    this.store.putProject({ ...record, row });
    this.engine.listChanged();
  }

  // Reads the server's list and brings the store in line with it. One at a
  // time; a call while one runs waits for it.
  refreshFromServer(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.listing ??= this.list().finally(() => {
      this.listing = null;
    });
    return this.listing;
  }

  private async list(): Promise<void> {
    const server = this.server();
    if (!server) return;
    // Only projects already uploaded when the request left can be missing
    // from its answer for a reason: one uploaded meanwhile is not binned.
    const uploadedBefore = new Set(
      this.store
        .listProjects()
        .filter((p) => p.uploaded)
        .map((p) => p.id),
    );
    const { projects } = await server.json<{ projects: ProjectRow[] }>('/api/projects');
    if (this.closed) return;
    this.apply(projects, uploadedBefore);
  }

  apply(serverRows: readonly ProjectRow[], uploadedBefore: ReadonlySet<string>): void {
    const local = new Map(this.store.listProjects().map((p) => [p.id, p]));
    const listed = new Set<string>();
    let changed = false;
    for (const row of serverRows) {
      listed.add(row.id);
      const record = local.get(row.id);
      if (!record) {
        this.store.putProject({
          id: row.id,
          row,
          serverEditedAt: row.editedAt,
          deletedAt: null,
          createdLocal: false,
          uploaded: true,
        });
        this.engine.add(row.id);
        changed = true;
        continue;
      }
      const next: ProjectRecord = { ...record, serverEditedAt: row.editedAt, deletedAt: null, uploaded: true };
      // A downloaded document's row is its own; the server's dates win
      // unless this device edited it since.
      next.row = this.engine.isDownloaded(row.id)
        ? {
            ...record.row,
            createdAt: row.createdAt,
            editedAt: record.row.editedAt > row.editedAt ? record.row.editedAt : row.editedAt,
            deletedAt: null,
          }
        : row;
      if (JSON.stringify(next) !== JSON.stringify(record)) {
        this.store.putProject(next);
        changed = true;
      }
      if (record.deletedAt !== null) {
        this.engine.add(row.id);
        changed = true;
      }
      // Made here and uploaded, though the upload's answer never came back.
      if (!record.uploaded) this.engine.uploaded(row.id);
    }
    for (const record of local.values()) {
      if (listed.has(record.id) || record.deletedAt !== null || !record.uploaded) continue;
      if (!uploadedBefore.has(record.id)) continue;
      this.markDeleted(record.id);
      changed = true;
    }
    if (changed) this.engine.listChanged();
  }

  // Binned or purged on the server: out of the list, kept in the store.
  markDeleted(id: string): void {
    const record = this.store.getProject(id);
    if (!record || record.deletedAt !== null) return;
    const deletedAt = new Date(this.now()).toISOString();
    this.store.putProject({ ...record, deletedAt, row: { ...record.row, deletedAt } });
    this.engine.remove(id);
    this.engine.listChanged();
  }

  // The daily purge: projects out of the list for more than 30 days go from
  // this device with their documents and local snapshots.
  purge(): number {
    let removed = 0;
    for (const record of this.store.listProjects()) {
      if (record.deletedAt === null || Date.parse(record.deletedAt) > this.now() - PURGE_AFTER_MS) continue;
      this.store.removeProject(record.id);
      removed += 1;
    }
    return removed;
  }

  // The rows still waiting to be built are built now.
  close(): void {
    for (const [id, { timer, local }] of this.timers) {
      clearTimeout(timer);
      this.refreshRow(id, local);
    }
    this.timers.clear();
    this.closed = true;
  }
}
