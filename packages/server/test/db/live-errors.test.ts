import { readDocument } from 'promptbook-project';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
import { db, ORIGIN, signedIn, startApp, steve } from './helpers.js';

// A write inside the live document's transaction that throws, as a bug in a
// writer would: the route must answer an error, the server must live on, and
// nothing must change or stay behind.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a write that throws inside the live transaction', () => {
  it('answers an error, keeps the server up, changes nothing and closes the connection', async () => {
    const user = await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const headers = { cookie: `pb_session=${token}`, origin: ORIGIN };
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers,
      payload: { category: 'adventure', title: 'Prova' },
    });
    const id = created.json().project.id as string;
    const saved = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/snapshots`,
      headers,
      payload: { label: 'a' },
    });
    await withLiveDocument(app.sync, id, user.id, (doc) => setDocumentText(doc, 'Testo cambiato.\n'));
    const stored = async () => {
      const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, row!.state);
      return readDocument(doc);
    };

    const fail = () => {
      throw new Error('A writer failed.');
    };
    vi.spyOn(Y.Text.prototype, 'delete').mockImplementation(fail);
    vi.spyOn(Y.Text.prototype, 'insert').mockImplementation(fail);
    const restore = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/snapshots/${saved.json().snapshot.id}/restore`,
      headers,
    });
    vi.restoreAllMocks();
    expect(restore.statusCode).toBe(500);
    expect(restore.json()).toEqual({ error: 'internal', message: 'Something went wrong on the server.' });

    // The server answers the next request, the text is unchanged, the restore
    // snapshot is gone and no connection holds the document.
    const list = await app.inject({ method: 'GET', url: `/api/projects/${id}/snapshots`, headers });
    expect(list.statusCode).toBe(200);
    expect(list.json().snapshots.map((s: { kind: string }) => s.kind)).toEqual(['user']);
    expect(await stored()).toBe('Testo cambiato.\n');
    expect(app.sync.liveDocument(id)).toBeNull();
  });
});
