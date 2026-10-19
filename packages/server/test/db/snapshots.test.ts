import type { FastifyInstance } from 'fastify';
import { addTodo, findTarget, readDocument, readTodo } from 'promptbook-project';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createUser, type User } from '../../src/accounts/users.js';
import { openLiveDocument, setDocumentText, withLiveDocument } from '../../src/live.js';
import { getProject, purge } from '../../src/projects.js';
import { insertSnapshot, snapshotThenWrite, textHash } from '../../src/snapshots.js';
import { STORED } from '../../src/sync.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve } from './helpers.js';
import { connect, destroyClients, listen, synced, waitFor, type Client } from './sync-helpers.js';

const auth = (token: string) => ({ cookie: `pb_session=${token}`, origin: ORIGIN });

// A small adventure: two sections around the scenes, and S1.
const ADVENTURE = [
  '## Orologio',
  '',
  'Prima scossa a mezzanotte.',
  '',
  '## Scene',
  '',
  '### S1. La casa che cede',
  '',
  '**Luogo e momento:** casa Faraci, mezzanotte.',
  '',
  '## Indizi',
  '',
  'Il quaderno di Neri.',
  '',
].join('\n');

interface Setup {
  app: FastifyInstance;
  user: User;
  token: string;
  id: string;
  call(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown): Promise<{ statusCode: number; json(): any }>;
}

async function setup(text = ADVENTURE): Promise<Setup> {
  const user = await steve();
  const app = await startApp();
  const token = await signedIn(app);
  const call: Setup['call'] = (method, url, payload) =>
    app.inject({ method, url, headers: auth(token), ...(payload !== undefined ? { payload: payload as object } : {}) });
  const created = await call('POST', '/api/projects', { category: 'adventure', title: "L'Ancora di Sabaoth" });
  const id = created.json().project.id as string;
  await withLiveDocument(app.sync, id, user.id, (doc) => setDocumentText(doc, text));
  return { app, user, token, id, call };
}

async function storedText(id: string): Promise<string> {
  const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, row!.state);
  return readDocument(doc);
}

const snapshotRows = (id: string) =>
  db.query<{ kind: string; label: string; text: string }>(
    'select kind, label, text from snapshots where project_id = $1 order by created_at, id',
    [id],
  );

const messagesOf = (client: Client) =>
  client.stateless.flatMap((m) => {
    const parsed = JSON.parse(m) as { type: string };
    return parsed.type === 'snapshot' ? [parsed] : [];
  });

// A Claude edit as brief B's tools will store it: the snapshot of the text
// before, then the text with the target replaced.
async function claudeEdit(s: Setup, target: string, replacement: string, tool = 'replace_section') {
  const before = await storedText(s.id);
  const found = findTarget(before, 'adventure', target);
  if (!found.ok) throw new Error(found.error);
  const after = before.slice(0, found.target.from) + replacement + before.slice(found.target.to);
  const snapshot = await insertSnapshot(db, {
    projectId: s.id,
    kind: 'claude',
    label: `${target} · ${found.target.title}`,
    text: before,
    category: 'adventure',
    tool,
    target,
    beforeSection: before.slice(found.target.from, found.target.to),
    afterHash: textHash(replacement),
  });
  await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setDocumentText(doc, after));
  return { snapshot, before, after };
}

afterEach(destroyClients);

describe('the live write path', () => {
  it('writes and stores a project no one has open, then lets it go', async () => {
    const s = await setup();
    expect(await storedText(s.id)).toBe(ADVENTURE);
    const project = await getProject(db, s.user.id, s.id);
    expect(project!.scenes).toBe(1);
    expect(s.app.sync.liveDocument(s.id)).toBeNull();
    const ids = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => [addTodo(doc, 'Prompt Suno')]);
    expect(ids).toHaveLength(1);
    expect(s.app.sync.liveDocument(s.id)).toBeNull();
  });

  it('reaches an open client at once and merges with its typing', async () => {
    const s = await setup();
    const url = await listen(s.app);
    const client = connect(url, s.id, { token: s.token });
    await synced(client);
    client.doc.getText('document').insert(0, 'Bozza.\n\n');
    await waitFor(() => readDocument(s.app.sync.liveDocument(s.id)!).startsWith('Bozza.'), 'the typing on the server');
    client.stateless.length = 0;

    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      const text = readDocument(doc);
      setDocumentText(doc, text.replace('Il quaderno di Neri.', 'Il quaderno di Neri, bruciato.'));
    });
    await waitFor(() => readDocument(client.doc).includes('bruciato'), 'the write in the client');
    expect(readDocument(client.doc).startsWith('Bozza.\n\n## Orologio')).toBe(true);
    // Stored at once, with the client still open.
    expect(await storedText(s.id)).toContain('Il quaderno di Neri, bruciato.');
    expect(client.stateless).toContain(STORED);
    expect(s.app.sync.liveDocument(s.id)).not.toBeNull();
  });

  it('keeps every write when two writers share the live document', async () => {
    const s = await setup();
    const [a, b] = await Promise.all([
      openLiveDocument(s.app.sync, s.id, s.user.id),
      openLiveDocument(s.app.sync, s.id, s.user.id),
    ]);
    expect(a.doc).toBe(b.doc);
    a.transact((doc) => addTodo(doc, 'Da A'));
    await b.close();
    a.transact((doc) => addTodo(doc, 'Ancora da A'));
    await a.close();
    expect(() => a.transact(() => null)).toThrow('closed');
    const texts = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => readTodo(doc).map((t) => t.text));
    expect(texts.slice(-2)).toEqual(['Da A', 'Ancora da A']);
  });
});

describe('snapshotThenWrite', () => {
  it('snapshots again when a keystroke lands between the snapshot and the write', async () => {
    const s = await setup();
    const live = await openLiveDocument(s.app.sync, s.id, s.user.id);
    let attempt = 0;
    try {
      const stored = await snapshotThenWrite(db, live, {
        snapshot: async (text) => {
          const row = await insertSnapshot(db, {
            projectId: s.id,
            kind: 'restore',
            label: 'x',
            text,
            category: 'adventure',
          });
          // A client types during the first insert.
          if (attempt++ === 0) live.doc.getText('document').insert(0, 'Battuta. ');
          return row;
        },
        next: (text) => text.replace('Prima scossa', 'Seconda scossa'),
      });
      expect(stored.text.startsWith('Battuta. ## Orologio')).toBe(true);
    } finally {
      await live.close();
    }
    expect(attempt).toBe(2);
    const rows = await snapshotRows(s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe(`Battuta. ${ADVENTURE}`);
    expect(await storedText(s.id)).toBe(`Battuta. ${ADVENTURE}`.replace('Prima scossa', 'Seconda scossa'));
  });

  it('gives up, leaving no snapshot and the text as typed, when the text keeps moving', async () => {
    const s = await setup();
    const live = await openLiveDocument(s.app.sync, s.id, s.user.id);
    try {
      await expect(
        snapshotThenWrite(db, live, {
          snapshot: async (text) => {
            const row = await insertSnapshot(db, {
              projectId: s.id,
              kind: 'restore',
              label: 'x',
              text,
              category: 'adventure',
            });
            live.doc.getText('document').insert(0, '.');
            return row;
          },
          next: () => 'tutto sostituito',
        }),
      ).rejects.toMatchObject({ status: 409, code: 'document_busy' });
    } finally {
      await live.close();
    }
    expect(await snapshotRows(s.id)).toEqual([]);
    expect(await storedText(s.id)).toBe(`...${ADVENTURE}`);
  });

  it('stores nothing when the next text is refused', async () => {
    const s = await setup();
    const live = await openLiveDocument(s.app.sync, s.id, s.user.id);
    try {
      await expect(
        snapshotThenWrite(db, live, {
          snapshot: (text) =>
            insertSnapshot(db, { projectId: s.id, kind: 'restore', label: 'x', text, category: 'adventure' }),
          next: () => {
            throw new Error('refused');
          },
        }),
      ).rejects.toThrow('refused');
    } finally {
      await live.close();
    }
    expect(await snapshotRows(s.id)).toEqual([]);
  });
});

describe('snapshots API', () => {
  it('saves, lists newest first without the text, and gets one with it', async () => {
    const s = await setup();
    const first = await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: '  prima della lettura  ' });
    expect(first.statusCode).toBe(201);
    expect(first.json().snapshot).toMatchObject({
      kind: 'user',
      label: 'prima della lettura',
      tool: null,
      target: null,
      words: 22,
      expiresAt: null,
    });
    await claudeEdit(s, 'S1', '### S1. La casa che cede\n\nClaude scrive qui.');

    const list = await s.call('GET', `/api/projects/${s.id}/snapshots`);
    const snapshots = list.json().snapshots as { id: string; kind: string; createdAt: string; expiresAt: string }[];
    expect(snapshots.map((x) => x.kind)).toEqual(['claude', 'user']);
    expect(snapshots[0]).not.toHaveProperty('text');
    const claude = snapshots[0]!;
    expect(Date.parse(claude.expiresAt) - Date.parse(claude.createdAt)).toBe(30 * 86_400_000);
    expect(snapshots[0]).toMatchObject({ tool: 'replace_section', target: 'S1', label: 'S1 · La casa che cede' });

    const only = await s.call('GET', `/api/projects/${s.id}/snapshots?kind=claude&limit=1`);
    expect(only.json().snapshots.map((x: { id: string }) => x.id)).toEqual([claude.id]);
    expect((await s.call('GET', `/api/projects/${s.id}/snapshots?kind=user`)).json().snapshots).toHaveLength(1);
    expect((await s.call('GET', `/api/projects/${s.id}/snapshots?kind=other`)).statusCode).toBe(400);
    expect((await s.call('GET', `/api/projects/${s.id}/snapshots?limit=0`)).statusCode).toBe(400);

    const one = await s.call('GET', `/api/projects/${s.id}/snapshots/${first.json().snapshot.id}`);
    expect(one.json().snapshot.text).toBe(ADVENTURE);
    expect(
      (await s.call('GET', `/api/projects/${s.id}/snapshots/00000000-0000-4000-8000-000000000000`)).statusCode,
    ).toBe(404);
    expect((await s.call('GET', `/api/projects/${s.id}/snapshots/nope`)).statusCode).toBe(404);
  });

  it('refuses an empty or a long name', async () => {
    const s = await setup();
    expect((await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: '   ' })).statusCode).toBe(400);
    expect((await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: 'a'.repeat(201) })).statusCode).toBe(400);
    expect(await snapshotRows(s.id)).toEqual([]);
  });

  it('snapshots the text an open client has typed, and tells the clients', async () => {
    const s = await setup();
    const url = await listen(s.app);
    const client = connect(url, s.id, { token: s.token });
    await synced(client);
    client.doc.getText('document').insert(0, 'Non ancora salvato.\n\n');
    await waitFor(
      () => readDocument(s.app.sync.liveDocument(s.id)!).startsWith('Non ancora'),
      'the typing on the server',
    );
    const created = await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: 'adesso' });
    const { id } = created.json().snapshot as { id: string };
    expect((await snapshotRows(s.id))[0]!.text.startsWith('Non ancora salvato.')).toBe(true);
    await waitFor(() => messagesOf(client).length > 0, 'the snapshot message');
    expect(messagesOf(client)).toEqual([{ type: 'snapshot', id, kind: 'user' }]);
  });

  it('restores through the live document, a restore snapshot first, and back again', async () => {
    const s = await setup();
    const saved = (await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: 'prima' })).json().snapshot;
    const url = await listen(s.app);
    const client = connect(url, s.id, { token: s.token });
    await synced(client);
    client.doc.getText('document').insert(ADVENTURE.length, 'Riga aggiunta.\n');
    const edited = `${ADVENTURE}Riga aggiunta.\n`;
    await waitFor(() => readDocument(s.app.sync.liveDocument(s.id)!) === edited, 'the typing on the server');

    const restored = await s.call('POST', `/api/projects/${s.id}/snapshots/${saved.id}/restore`);
    expect(restored.statusCode).toBe(200);
    const restore = restored.json().snapshot;
    expect(restore).toMatchObject({ kind: 'restore', label: `prima · ${saved.createdAt}` });
    await waitFor(() => readDocument(client.doc) === ADVENTURE, 'the restored text in the client');
    await waitFor(() => messagesOf(client).some((m) => (m as { id?: string }).id === restore.id), 'the message');
    expect(await storedText(s.id)).toBe(ADVENTURE);
    expect((await snapshotRows(s.id)).find((r) => r.kind === 'restore')!.text).toBe(edited);

    // Restoring the restore snapshot puts back the text from before.
    expect((await s.call('POST', `/api/projects/${s.id}/snapshots/${restore.id}/restore`)).statusCode).toBe(200);
    await waitFor(() => readDocument(client.doc) === edited, 'the text from before the first restore');
    expect(await storedText(s.id)).toBe(edited);
  });

  it('deletes only the user’s own snapshots', async () => {
    const s = await setup();
    const own = (await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: 'mia' })).json().snapshot;
    const { snapshot: claude } = await claudeEdit(s, 'S1', '### S1. La casa che cede\n\nNuovo.');
    const restore = (await s.call('POST', `/api/projects/${s.id}/snapshots/${own.id}/restore`)).json().snapshot;

    expect((await s.call('DELETE', `/api/projects/${s.id}/snapshots/${claude.id}`)).json()).toMatchObject({
      error: 'not_deletable',
    });
    expect((await s.call('DELETE', `/api/projects/${s.id}/snapshots/${restore.id}`)).statusCode).toBe(409);
    expect((await s.call('DELETE', `/api/projects/${s.id}/snapshots/${own.id}`)).statusCode).toBe(204);
    expect((await s.call('DELETE', `/api/projects/${s.id}/snapshots/${own.id}`)).statusCode).toBe(404);
    expect((await snapshotRows(s.id)).map((r) => r.kind)).toEqual(['claude', 'restore']);
  });

  it('answers 404 for a project in the bin or another user’s', async () => {
    const s = await setup();
    const saved = (await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: 'prima' })).json().snapshot;
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const anna = await signedIn(s.app, 'anna');
    const asAnna = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
      s.app.inject({ method, url, headers: auth(anna), ...(payload ? { payload } : {}) });
    expect((await asAnna('GET', `/api/projects/${s.id}/snapshots`)).statusCode).toBe(404);
    expect((await asAnna('GET', `/api/projects/${s.id}/snapshots/${saved.id}`)).statusCode).toBe(404);
    expect((await asAnna('POST', `/api/projects/${s.id}/snapshots/${saved.id}/restore`)).statusCode).toBe(404);
    expect((await asAnna('DELETE', `/api/projects/${s.id}/snapshots/${saved.id}`)).statusCode).toBe(404);

    expect((await s.call('DELETE', `/api/projects/${s.id}`)).statusCode).toBe(204);
    expect((await s.call('GET', `/api/projects/${s.id}/snapshots`)).statusCode).toBe(404);
    expect((await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: 'x' })).statusCode).toBe(404);
    expect((await s.call('POST', `/api/projects/${s.id}/snapshots/${saved.id}/restore`)).statusCode).toBe(404);
    expect((await s.call('POST', `/api/projects/${s.id}/snapshots/${saved.id}/undo`)).statusCode).toBe(404);
    expect((await s.call('DELETE', `/api/projects/${s.id}/snapshots/${saved.id}`)).statusCode).toBe(404);
    expect(await snapshotRows(s.id)).toHaveLength(1);
  });

  it('needs a session', async () => {
    const s = await setup();
    const response = await s.app.inject({ method: 'GET', url: `/api/projects/${s.id}/snapshots` });
    expect(response.statusCode).toBe(401);
  });
});

describe('undo of a Claude edit', () => {
  it('puts back only the edited part, keeping what was typed elsewhere', async () => {
    const s = await setup();
    const { snapshot, after } = await claudeEdit(s, 'S1', '### S1. La casa che cede\n\nClaude scrive qui.');
    const url = await listen(s.app);
    const client = connect(url, s.id, { token: s.token });
    await synced(client);
    client.doc.getText('document').insert(after.indexOf('Il quaderno'), 'Typed. ');
    await waitFor(() => readDocument(s.app.sync.liveDocument(s.id)!).includes('Typed.'), 'the typing on the server');

    const undone = await s.call('POST', `/api/projects/${s.id}/snapshots/${snapshot.id}/undo`);
    expect(undone.statusCode).toBe(200);
    const expected = ADVENTURE.replace('Il quaderno', 'Typed. Il quaderno');
    await waitFor(() => readDocument(client.doc) === expected, 'the undone text in the client');
    expect(await storedText(s.id)).toBe(expected);
    expect(undone.json().snapshot).toMatchObject({
      kind: 'restore',
      label: "Before undoing Claude's edit of S1 · La casa che cede",
    });
    const restore = (await snapshotRows(s.id)).find((r) => r.kind === 'restore')!;
    expect(restore.text).toContain('Claude scrive qui.');
    expect(restore.text).toContain('Typed. Il quaderno');
    await waitFor(() => messagesOf(client).some((m) => (m as { kind?: string }).kind === 'restore'), 'the message');
  });

  it('refuses with section_changed when the part changed after the edit', async () => {
    const s = await setup();
    const { snapshot, after } = await claudeEdit(s, 'S1', '### S1. La casa che cede\n\nClaude scrive qui.');
    const touched = after.replace('Claude scrive qui.', 'Claude scrive qui, e io pure.');
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setDocumentText(doc, touched));

    const response = await s.call('POST', `/api/projects/${s.id}/snapshots/${snapshot.id}/undo`);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'section_changed',
      message: "This part changed after Claude's edit. Use History to restore the whole document.",
    });
    expect(await storedText(s.id)).toBe(touched);
    expect((await snapshotRows(s.id)).map((r) => r.kind)).toEqual(['claude']);
  });

  it('refuses with section_changed when the part is gone', async () => {
    const s = await setup();
    const { snapshot, after } = await claudeEdit(s, 'S1', '### S1. La casa che cede\n\nClaude scrive qui.');
    const gone = after.replace(/### S1\.[\s\S]*?(?=\n\n## Indizi)/, '').replace('## Scene\n\n\n\n', '## Scene\n\n');
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setDocumentText(doc, gone));
    const response = await s.call('POST', `/api/projects/${s.id}/snapshots/${snapshot.id}/undo`);
    expect(response.json()).toMatchObject({ error: 'section_changed' });
  });

  it('removes a scene Claude added, with the blank lines before it', async () => {
    const s = await setup();
    const scene = '### S2. Il cordone di Donato\n\nI Quieti chiudono la strada.';
    const before = await storedText(s.id);
    const end = before.indexOf('\n\n## Indizi');
    const after = `${before.slice(0, end)}\n\n${scene}${before.slice(end)}`;
    const snapshot = await insertSnapshot(db, {
      projectId: s.id,
      kind: 'claude',
      label: 'S2 · Il cordone di Donato',
      text: before,
      category: 'adventure',
      tool: 'add_scene',
      target: 'S2',
      beforeSection: '',
      afterHash: textHash(scene),
    });
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setDocumentText(doc, after));

    expect((await s.call('POST', `/api/projects/${s.id}/snapshots/${snapshot.id}/undo`)).statusCode).toBe(200);
    expect(await storedText(s.id)).toBe(ADVENTURE);
  });

  it('refuses a snapshot that is not a Claude edit', async () => {
    const s = await setup();
    const own = (await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: 'mia' })).json().snapshot;
    const response = await s.call('POST', `/api/projects/${s.id}/snapshots/${own.id}/undo`);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'not_undoable' });
    expect((await s.call('POST', `/api/projects/${s.id}/snapshots/nope/undo`)).statusCode).toBe(404);
  });
});

describe('purge', () => {
  it('removes expired Claude and restore snapshots and keeps the user’s', async () => {
    const s = await setup();
    const insert = (kind: 'claude' | 'user' | 'restore', label: string) =>
      insertSnapshot(db, { projectId: s.id, kind, label, text: 'x', category: 'adventure' });
    const age = (id: string, days: number) =>
      db.query('update snapshots set created_at = now() - make_interval(days => $2) where id = $1', [id, days]);
    await age((await insert('claude', 'old claude')).id, 31);
    await age((await insert('restore', 'old restore')).id, 31);
    await age((await insert('claude', 'recent claude')).id, 29);
    await age((await insert('user', 'old user')).id, 365);

    expect((await purge(db)).snapshots).toBe(2);
    expect((await snapshotRows(s.id)).map((r) => r.label).sort()).toEqual(['old user', 'recent claude']);
  });

  it('removes the snapshots of a project purged from the bin', async () => {
    const s = await setup();
    await s.call('POST', `/api/projects/${s.id}/snapshots`, { label: 'mia' });
    await s.call('DELETE', `/api/projects/${s.id}`);
    await db.query("update projects set deleted_at = now() - interval '31 days' where id = $1", [s.id]);
    expect((await purge(db)).projects).toBe(1);
    expect(await snapshotRows(s.id)).toEqual([]);
  });
});
