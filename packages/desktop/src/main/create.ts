import { randomUUID } from 'node:crypto';
import {
  createProjectDoc,
  defaultSettings,
  isCategory,
  isStatus,
  projectRow,
  skeletonDocument,
  summarize,
  type Category,
  type ProjectRow,
  type Settings,
  type Status,
} from 'promptbook-project';
import * as Y from 'yjs';
import type { ProjectList } from './projects.js';
import { HttpError, OfflineError, type ServerClient } from './server.js';
import type { Store } from './store.js';
import type { SyncEngine } from './sync.js';

// New projects on the desktop, online or not (desktop-app design decision 9):
// made on this device from the cached settings with an id chosen here, kept
// in the store, then uploaded with that id and the Yjs state before their
// provider attaches: at once when online, and on every reconnect for those
// not uploaded yet. 201 or 200 attach the provider; 409 or 400 leave the
// project on this device only.

export interface NewProjectInput {
  category: Category;
  title: string;
  campaignId: string | null;
  system?: string;
  status: Status;
  seed: string;
}

export class ValidationError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The body of POST /api/projects as the server reads it (createBody).
export function readNewProject(body: unknown): NewProjectInput {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') throw new ValidationError('The body must be an object.');
  if (!isCategory(b.category)) throw new ValidationError('category: is not a category.');
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > 200) throw new ValidationError('title: is required, up to 200 characters.');
  const campaignId = b.campaignId ?? null;
  if (campaignId !== null && (typeof campaignId !== 'string' || !UUID.test(campaignId))) {
    throw new ValidationError('campaignId: is not an id.');
  }
  const status = b.status ?? 'draft';
  if (!isStatus(status)) throw new ValidationError('status: is not a status.');
  const seed = b.seed ?? '';
  if (typeof seed !== 'string' || seed.length > 10_000) throw new ValidationError('seed: is too long.');
  const input: NewProjectInput = { category: b.category, title, campaignId, status, seed };
  if (b.system !== undefined) {
    if (typeof b.system !== 'string' || b.system.trim().length > 200) throw new ValidationError('system: is too long.');
    input.system = b.system.trim();
  }
  return input;
}

export class InvalidCampaignError extends Error {}

export class Creator {
  private inflight = new Map<string, Promise<void>>();
  // Refused by the server (409 or 400): not tried again until a relaunch.
  private refused = new Set<string>();

  constructor(
    private readonly store: Store,
    private readonly engine: SyncEngine,
    private readonly list: ProjectList,
    private readonly server: () => ServerClient | null,
    private readonly now: () => number = Date.now,
    private readonly log: (message: string) => void = console.warn,
  ) {}

  // Makes the project here and starts its upload. Answers its row.
  create(input: NewProjectInput): ProjectRow {
    const settings = (this.store.getCache('settings')?.value as Settings | undefined) ?? defaultSettings();
    const campaigns = this.list.campaigns();
    const campaign =
      input.campaignId === null || input.category === 'campaign'
        ? null
        : campaigns.find((c) => c.id === input.campaignId);
    if (campaign === undefined) throw new InvalidCampaignError('campaignId: is not one of your campaigns.');
    const id = randomUUID();
    const createdAt = new Date(this.now()).toISOString();
    const system = input.system ?? settings.system;
    const doc = createProjectDoc({
      id,
      title: input.title,
      category: input.category,
      status: input.status,
      campaignId: campaign?.id ?? null,
      system,
      seed: input.seed,
      createdAt,
      todo: settings.todoTemplates[input.category] ?? [],
      document: skeletonDocument(input.category, {
        title: input.title,
        system,
        campaignTitle: campaign?.title ?? null,
        author: settings.author,
        copyright: settings.copyright,
        licence: settings.licence,
      }),
    });
    const row = projectRow(
      summarize(doc, { campaigns }),
      { createdAt, editedAt: createdAt, deletedAt: null },
      campaigns,
    );
    // The new document, stored as one update before anything else sees it.
    this.store.appendUpdate(id, Y.encodeStateAsUpdate(doc), 'main');
    this.store.putProject({
      id,
      row,
      serverEditedAt: null,
      deletedAt: null,
      createdLocal: true,
      uploaded: false,
    });
    this.engine.add(id, { localOnly: true, doc });
    this.engine.listChanged();
    if (this.engine.isOnline) void this.upload(id);
    return row;
  }

  // Every project made here and not on the server yet, once each.
  uploadPending(): Promise<void> {
    const pending = this.store
      .listProjects()
      .filter((p) => !p.uploaded && p.deletedAt === null && !this.refused.has(p.id));
    return Promise.all(pending.map((p) => this.upload(p.id))).then(() => {});
  }

  upload(id: string): Promise<void> {
    let running = this.inflight.get(id);
    if (!running) {
      running = this.doUpload(id).finally(() => this.inflight.delete(id));
      this.inflight.set(id, running);
    }
    return running;
  }

  private async doUpload(id: string): Promise<void> {
    const server = this.server();
    const doc = this.engine.doc(id);
    const record = this.store.getProject(id);
    if (!server || !doc || !record || record.uploaded) return;
    const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    try {
      await server.json('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, state }),
      });
    } catch (error) {
      if (error instanceof HttpError && (error.status === 409 || error.status === 400)) {
        this.refused.add(id);
        this.log(`Project ${id} stays on this device: the server answered ${error.status} ${error.code ?? ''}.`);
        return;
      }
      if (error instanceof OfflineError) return;
      // Signed out, or a server error: tried again on the next reconnect.
      return;
    }
    const now = this.store.getProject(id);
    if (!now) return;
    this.store.putProject({ ...now, uploaded: true });
    this.engine.uploaded(id);
    this.engine.listChanged();
  }
}
