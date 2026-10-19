import { addTodo, readDocument, readMeta, readTodo, updateTodo } from 'promptbook-project';
import { afterEach, describe, expect, it } from 'vitest';
import { createUser } from '../../src/accounts/users.js';
import { DELETED, STORE_FAILED, STORED } from '../../src/sync.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve } from './helpers.js';
import { connect, destroyClients, listen, synced, waitFor } from './sync-helpers.js';
import type { FastifyInstance } from 'fastify';

const auth = (token: string) => ({ cookie: `pb_session=${token}`, origin: ORIGIN });

async function newProject(app: FastifyInstance, token: string, body: Record<string, unknown> = {}): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth(token),
    payload: { category: 'adventure', title: 'Il ballo dei Lorenzetti', ...body },
  });
  if (response.statusCode !== 201) throw new Error(`Create failed: ${response.statusCode} ${response.body}`);
  return response.json().project.id as string;
}

async function storedText(id: string): Promise<string | null> {
  const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]);
  if (!row) return null;
  const Y = await import('yjs');
  const doc = new Y.Doc();
  Y.applyUpdate(doc, row.state);
  return readDocument(doc);
}

afterEach(destroyClients);

describe('sync between clients', () => {
  it('merges a sentence typed in one client with a tick in the other', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);

    const a = connect(url, id, { token });
    const b = connect(url, id, { token });
    await Promise.all([synced(a), synced(b)]);
    expect(readMeta(a.doc).title).toBe('Il ballo dei Lorenzetti');

    const first = readTodo(b.doc)[0]!;
    a.doc.getText('document').insert(0, 'Una frase nuova.\n');
    updateTodo(b.doc, first.id, { done: true });

    await waitFor(
      () => readDocument(b.doc).startsWith('Una frase nuova.') && readTodo(a.doc)[0]!.done,
      'both edits in both clients',
      2_000,
    );
  });

  it('merges edits made offline once the client reconnects', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);

    const a = connect(url, id, { token });
    const b = connect(url, id, { token });
    await Promise.all([synced(a), synced(b)]);

    a.provider.disconnect();
    const text = a.doc.getText('document');
    text.insert(text.length, '\nScritto offline.\n');
    b.doc.getText('document').insert(0, 'Scritto online.\n');
    await waitFor(() => !b.provider.hasUnsyncedChanges, 'b to reach the server');
    expect(readDocument(a.doc)).not.toContain('Scritto online.');

    await a.provider.connect();
    await waitFor(
      () =>
        [a, b].every((c) => readDocument(c.doc).includes('Scritto offline.') && readDocument(c.doc).includes('Scritto online.')),
      'both paragraphs in both clients',
    );
  });

  it('keeps edits across a restart', async () => {
    await steve();
    let app = await startApp();
    const token = await signedIn(app);
    const id = await newProject(app, token);
    let url = await listen(app);

    const a = connect(url, id, { token });
    await synced(a);
    addTodo(a.doc, 'Stampare le schede');
    a.doc.getText('document').insert(0, 'Prima del riavvio.\n');
    await waitFor(() => !a.provider.hasUnsyncedChanges, 'the edits to reach the server');
    // Closing the last connection stores at once.
    a.destroy();
    await waitFor(async () => (await storedText(id))?.startsWith('Prima del riavvio.') ?? false, 'the store');
    await app.close();

    app = await startApp();
    url = await listen(app);
    const b = connect(url, id, { token });
    await synced(b);
    expect(readDocument(b.doc)).toMatch(/^Prima del riavvio\./);
    expect(readTodo(b.doc).map((t) => t.text)).toContain('Stampare le schede');
  });

  it('updates the summary in the list when a tick is stored', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);

    const a = connect(url, id, { token });
    await synced(a);
    for (const item of readTodo(a.doc).slice(0, 5)) updateTodo(a.doc, item.id, { done: true });
    await waitFor(() => a.stateless.includes(STORED), 'the first store');
    const row = async () =>
      (await app.inject({ url: '/api/projects', headers: auth(token) })).json().projects.find((p: { id: string }) => p.id === id);
    expect(await row()).toMatchObject({ todoDone: 5, todoTotal: 9 });

    a.stateless.length = 0;
    updateTodo(a.doc, readTodo(a.doc)[5]!.id, { done: true });
    await waitFor(() => a.stateless.includes(STORED), 'the second store');
    expect(await row()).toMatchObject({ todoDone: 6, todoTotal: 9, status: 'draft' });
  });
});

describe('who may open a document', () => {
  it('refuses a connection without a session and sends no content', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);

    const a = connect(url, id, { token: null });
    await waitFor(() => a.authFailures.length > 0, 'the refusal');
    expect(a.doc.getMap('meta').size).toBe(0);
    expect(readDocument(a.doc)).toBe('');
  });

  it('refuses a connection from a foreign origin, even with the cookie', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);

    const a = connect(url, id, { token, origin: 'https://evil.example' });
    await waitFor(() => a.authFailures.length > 0, 'the refusal');
    expect(a.doc.getMap('meta').size).toBe(0);
  });

  it("refuses another user's project and an unknown id", async () => {
    await steve();
    await createUser(db, { username: 'other', password: PASSWORD, displayName: 'Other' });
    const app = await startApp();
    const id = await newProject(app, await signedIn(app));
    const url = await listen(app);
    const otherToken = await signedIn(app, 'other');

    const a = connect(url, id, { token: otherToken });
    const b = connect(url, 'not-a-project', { token: otherToken });
    await waitFor(() => a.authFailures.length > 0 && b.authFailures.length > 0, 'both refusals');
    expect(a.doc.getMap('meta').size).toBe(0);
  });

  it('closes an open project moved to the bin and refuses new connections', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);

    const a = connect(url, id, { token });
    await synced(a);
    const deleted = await app.inject({ method: 'DELETE', url: `/api/projects/${id}`, headers: auth(token) });
    expect(deleted.statusCode).toBe(204);
    await waitFor(() => a.stateless.includes(DELETED) && a.closes.length > 0, 'the deleted message and the close');

    const b = connect(url, id, { token });
    await waitFor(() => b.authFailures.length > 0, 'the refusal');
    expect(b.doc.getMap('meta').size).toBe(0);
  });

  it('closes the connections of a session that signs out, and the client then fails to authenticate', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const other = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);

    const a = connect(url, id, { token });
    const b = connect(url, id, { token: other });
    await Promise.all([synced(a), synced(b)]);

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: auth(token) });
    expect(out.statusCode).toBe(204);
    await waitFor(() => a.authFailures.length > 0, 'the reconnect to be refused');

    // Typed after sign-out: never reaches the server or the other session.
    a.doc.getText('document').insert(0, 'Dopo il logout.\n');
    b.doc.getText('document').insert(0, 'Ancora connesso.\n');
    await waitFor(() => !b.provider.hasUnsyncedChanges, 'b to sync');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(readDocument(b.doc)).not.toContain('Dopo il logout.');
    expect(b.authFailures).toEqual([]);
  });

  it('closes the connections of the other sessions on a password change', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const other = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);

    const a = connect(url, id, { token });
    const b = connect(url, id, { token: other });
    await Promise.all([synced(a), synced(b)]);

    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: auth(token),
      payload: { current: PASSWORD, next: 'a brand new password' },
    });
    expect(changed.statusCode).toBe(204);
    await waitFor(() => b.authFailures.length > 0, 'the other session to be refused');
    expect(a.authFailures).toEqual([]);
    expect(a.provider.isSynced).toBe(true);
  });
});

describe('storing', () => {
  it('tells the clients when a store fails, and again when a later one succeeds', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const id = await newProject(app, token);
    const url = await listen(app);
    const a = connect(url, id, { token });
    await synced(a);

    await db.query(`create or replace function refuse_store() returns trigger language plpgsql as
      $$ begin raise exception 'store refused for the test'; end $$`);
    await db.query('create trigger refuse_store before update on project_docs for each row execute function refuse_store()');
    try {
      a.doc.getText('document').insert(0, 'Non salvato.\n');
      await waitFor(() => a.stateless.includes(STORE_FAILED), 'store-failed');
      expect(a.stateless).not.toContain(STORED);
      expect(await storedText(id)).not.toContain('Non salvato.');
    } finally {
      await db.query('drop trigger refuse_store on project_docs');
      await db.query('drop function refuse_store()');
    }
    // No further edit: the retry stores it.
    await waitFor(() => a.stateless.at(-1) === STORED, 'stored after the failure', 10_000);
    expect(await storedText(id)).toMatch(/^Non salvato\./);
  });
});
