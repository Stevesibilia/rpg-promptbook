import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import type { FastifyInstance } from 'fastify';
import { parseAdventure, templates } from 'promptbook-format';
import { addTodo, defaultSettings, readDocument, readTodo, seedVersions } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/accounts/users.js';
import { loadProjectDoc, purge, storeProjectDoc } from '../../src/projects.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve } from './helpers.js';

const fixture = (name: string) => readFileSync(new URL(`../../../format/fixtures/${name}`, import.meta.url), 'utf8');

const auth = (token: string) => ({ cookie: `pb_session=${token}`, origin: ORIGIN });

function api(app: FastifyInstance, token: string) {
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: auth(token), ...(payload !== undefined ? { payload: payload as object } : {}) });
  return {
    call,
    async create(body: Record<string, unknown>) {
      const response = await call('POST', '/api/projects', body);
      if (response.statusCode !== 201) throw new Error(`Create failed: ${response.statusCode} ${response.body}`);
      return response.json().project;
    },
    async list(bin = false) {
      return (await call('GET', `/api/projects${bin ? '?bin=1' : ''}`)).json().projects as Array<Record<string, unknown>>;
    },
  };
}

async function signedInApi() {
  await steve();
  const app = await startApp();
  return { app, ...api(app, await signedIn(app)) };
}

describe('creating projects', () => {
  it('creates an adventure in a campaign from the templates and the settings', async () => {
    const { create, call, list } = await signedInApi();
    const settings = { ...defaultSettings(), author: 'Stefano Sibilia', licence: 'CC-BY-NC-SA-4.0', system: 'Kulthos' };
    expect((await call('PUT', '/api/settings', settings)).statusCode).toBe(200);

    const campaign = await create({ category: 'campaign', title: 'Blacksad - Il Continentale', system: 'Not The End' });
    const adventure = await create({
      category: 'adventure',
      title: 'Il ballo dei Lorenzetti',
      campaignId: campaign.id,
      system: 'Not The End',
      seed: 'Un ballo in maschera a Veridian.',
    });
    expect(adventure).toMatchObject({
      title: 'Il ballo dei Lorenzetti',
      category: 'adventure',
      status: 'draft',
      campaignId: campaign.id,
      system: 'Not The End',
      seed: 'Un ballo in maschera a Veridian.',
      todoDone: 0,
      todoTotal: 9,
      scenes: 1,
      deletedAt: null,
    });

    const doc = (await loadProjectDoc(db, adventure.id))!;
    const text = readDocument(doc);
    expect(text).toMatch(/^---\ntitolo: Il ballo dei Lorenzetti\nsistema: Not The End\nformato: avventura\n/);
    expect(text).toContain('campagna: Blacksad - Il Continentale\n');
    expect(text).toContain('autore: Stefano Sibilia\n');
    expect(text).toContain('licenza: CC-BY-NC-SA-4.0\n');
    const { problems } = parseAdventure(text, { template: templates.avventura });
    expect(problems.filter((p) => p.severity === 'error' && /^(meta|section|scene\.id)\./.test(p.code))).toEqual([]);
    expect(readTodo(doc).map((t) => t.text)).toEqual(settings.todoTemplates.adventure);

    // Without a system, the settings' default.
    expect((await create({ category: 'one-shot', title: 'Senza sistema' })).system).toBe('Kulthos');
    expect((await list()).map((p) => p.title).sort()).toEqual([
      'Blacksad - Il Continentale',
      'Il ballo dei Lorenzetti',
      'Senza sistema',
    ]);
  });

  it('gives a template change to new projects only', async () => {
    const { create, call } = await signedInApi();
    const before = await create({ category: 'adventure', title: 'Prima' });
    const settings = defaultSettings();
    settings.todoTemplates.adventure.push('Stampare le schede');
    await call('PUT', '/api/settings', settings);
    const after = await create({ category: 'adventure', title: 'Dopo' });
    expect(readTodo((await loadProjectDoc(db, before.id))!)).toHaveLength(9);
    expect(readTodo((await loadProjectDoc(db, after.id))!).at(-1)!.text).toBe('Stampare le schede');
  });

  it('refuses a campaign inside a campaign, and a campaign that is not the user’s', async () => {
    const { create, call } = await signedInApi();
    const campaign = await create({ category: 'campaign', title: 'Apocrypha' });
    const nested = await call('POST', '/api/projects', { category: 'campaign', title: 'Nested', campaignId: campaign.id });
    expect(nested.statusCode).toBe(400);
    expect(nested.json().error).toBe('invalid_campaign');
    const adventure = await create({ category: 'adventure', title: 'Avventura' });
    const intoAdventure = await call('POST', '/api/projects', {
      category: 'one-shot',
      title: 'X',
      campaignId: adventure.id,
    });
    expect(intoAdventure.statusCode).toBe(400);
    const missing = await call('POST', '/api/projects', { category: 'one-shot', title: 'X', campaignId: crypto.randomUUID() });
    expect(missing.statusCode).toBe(400);
    expect((await call('POST', '/api/projects', { category: 'saga', title: 'X' })).statusCode).toBe(400);
    expect((await call('POST', '/api/projects', { category: 'one-shot', title: '  ' })).statusCode).toBe(400);
  });
});

describe('the bin', () => {
  it('hides a deleted project, lists it in the bin, and restores it unchanged', async () => {
    const { create, call, list } = await signedInApi();
    const project = await create({ category: 'one-shot', title: "L'Ancora di Sabaoth", seed: 'Messina, 1908.' });
    const before = (await loadProjectDoc(db, project.id))!;

    expect((await call('DELETE', `/api/projects/${project.id}`)).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    const bin = await list(true);
    expect(bin.map((p) => p.id)).toEqual([project.id]);
    expect(bin[0]!.deletedAt).toEqual(expect.any(String));
    expect((await call('DELETE', `/api/projects/${project.id}`)).statusCode).toBe(404);

    const restored = await call('POST', `/api/projects/${project.id}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(restored.json().project).toMatchObject({ id: project.id, deletedAt: null });
    expect((await list()).map((p) => p.id)).toEqual([project.id]);
    expect(await list(true)).toEqual([]);
    const after = (await loadProjectDoc(db, project.id))!;
    expect(readDocument(after)).toBe(readDocument(before));
    expect(readTodo(after)).toEqual(readTodo(before));
    expect(seedVersions(after)).toEqual(seedVersions(before));
  });

  it('shows the adventures of a campaign in the bin as stand-alone until it is restored', async () => {
    const { create, call, list } = await signedInApi();
    const campaign = await create({ category: 'campaign', title: 'Cronaca del Gabbiano' });
    const child = await create({ category: 'adventure', title: "Le ali di Ca' Malamocco", campaignId: campaign.id });
    await call('DELETE', `/api/projects/${campaign.id}`);
    expect((await list()).find((p) => p.id === child.id)!.campaignId).toBeNull();
    await call('POST', `/api/projects/${campaign.id}/restore`);
    expect((await list()).find((p) => p.id === child.id)!.campaignId).toBe(campaign.id);
  });

  it('keeps the link of an adventure stored while its campaign is in the bin', async () => {
    const { create, call, list } = await signedInApi();
    const campaign = await create({ category: 'campaign', title: 'Cronaca del Gabbiano' });
    const child = await create({ category: 'adventure', title: "Le ali di Ca' Malamocco", campaignId: campaign.id });
    await call('DELETE', `/api/projects/${campaign.id}`);

    // An edit stored as sync stores it, while the campaign is in the bin.
    const doc = (await loadProjectDoc(db, child.id))!;
    addTodo(doc, 'Stampare le schede');
    await storeProjectDoc(db, child.id, doc);
    const binned = (await list()).find((p) => p.id === child.id)!;
    expect(binned).toMatchObject({ campaignId: null, todoTotal: 10 });

    // Restored, with no further edit: back under its campaign.
    await call('POST', `/api/projects/${campaign.id}/restore`);
    expect((await list()).find((p) => p.id === child.id)!.campaignId).toBe(campaign.id);
  });

  it('purges projects in the bin for more than 30 days, and sign-in failures older than a day', async () => {
    const { create, call, list } = await signedInApi();
    const old = await create({ category: 'one-shot', title: 'Vecchio' });
    const recent = await create({ category: 'one-shot', title: 'Recente' });
    await call('DELETE', `/api/projects/${old.id}`);
    await call('DELETE', `/api/projects/${recent.id}`);
    await db.query("update projects set deleted_at = now() - interval '31 days' where id = $1", [old.id]);
    await db.query("update projects set deleted_at = now() - interval '29 days' where id = $1", [recent.id]);
    await db.query(
      "insert into login_failures (username, ip, at) values ('x', '127.0.0.1', now() - interval '25 hours'), ('y', '127.0.0.1', now())",
    );

    await db.query(
      `insert into oidc_logins (state, browser_hash, nonce, code_verifier, return_to, expires_at)
       values ('old', 'h', 'n', 'v', '/', now() - interval '1 second'), ('live', 'h', 'n', 'v', '/', now() + interval '10 minutes')`,
    );

    expect(await purge(db)).toEqual({ projects: 1, loginFailures: 1, oidcLogins: 1 });
    expect(await db.query('select state from oidc_logins')).toEqual([{ state: 'live' }]);
    expect((await list(true)).map((p) => p.id)).toEqual([recent.id]);
    expect(await db.query('select 1 from project_docs where project_id = $1', [old.id])).toEqual([]);
    expect(await loadProjectDoc(db, recent.id)).not.toBeNull();
    expect(await db.query('select username from login_failures')).toEqual([{ username: 'y' }]);
    expect(await list()).toEqual([]);
  });
});

describe('projects belong to one user', () => {
  it("answers another user's project as if it did not exist", async () => {
    await steve();
    await createUser(db, { username: 'other', password: PASSWORD });
    const app = await startApp();
    const mine = api(app, await signedIn(app));
    const theirs = api(app, await signedIn(app, 'other'));
    const project = await mine.create({ category: 'one-shot', title: 'Mio' });
    const unknown = crypto.randomUUID();

    for (const [method, path] of [
      ['DELETE', '/api/projects/:id'],
      ['POST', '/api/projects/:id/restore'],
      ['GET', '/api/projects/:id/export'],
    ] as const) {
      const foreign = await theirs.call(method, path.replace(':id', project.id));
      const missing = await theirs.call(method, path.replace(':id', unknown));
      const malformed = await theirs.call(method, path.replace(':id', 'not-a-uuid'));
      expect([foreign.statusCode, missing.statusCode, malformed.statusCode]).toEqual([404, 404, 404]);
      expect(foreign.json()).toEqual(missing.json());
    }
    expect(await theirs.list()).toEqual([]);
    const campaign = await mine.create({ category: 'campaign', title: 'Mia campagna' });
    expect(
      (await theirs.call('POST', '/api/projects', { category: 'adventure', title: 'X', campaignId: campaign.id })).statusCode,
    ).toBe(400);
    expect((await mine.list()).map((p) => p.title).sort()).toEqual(['Mia campagna', 'Mio']);
  });

  it('refuses a cross-site delete and keeps the project', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const { create, list } = api(app, token);
    const project = await create({ category: 'one-shot', title: 'Resta' });
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
      headers: { cookie: `pb_session=${token}`, origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect((await list()).map((p) => p.id)).toEqual([project.id]);
  });

  it('answers 401 without a session', async () => {
    await steve();
    const app = await startApp();
    for (const url of ['/api/projects', '/api/projects?bin=1', '/api/export']) {
      expect((await app.inject({ url })).statusCode).toBe(401);
    }
  });
});

const joplinNote = `# Il pozzo di Ganzirri

Un pozzo che restituisce gli annegati.

![pozzo](../_resources/pozzo.jpg)

<img src="_resources/mappa.png" width="300">

![web](https://example.com/x.png)
`;

describe('import', () => {
  it('turns each note into one new project, with the report and the images left as references', async () => {
    const { create, call, list } = await signedInApi();
    const campaign = await create({ category: 'campaign', title: 'Cronaca del Gabbiano' });
    const sabaoth = fixture('l-ancora-di-sabaoth.md');
    const response = await call('POST', '/api/import', {
      notes: [
        { text: sabaoth, fileName: 'l-ancora-di-sabaoth.md', category: 'one-shot' },
        { text: joplinNote, fileName: 'Notes/pozzo.md', category: 'one-shot' },
        {
          text: '---\ntitolo: Le ali\ncampagna: Cronaca del Gabbiano\n---\n\nTesto.\n',
          fileName: 'ali.md',
          category: 'adventure',
        },
        { text: '# Spesa\n\n- latte\n- pane\n', fileName: 'spesa.md', title: 'Lista della spesa', category: 'adventure', campaignId: null },
      ],
    });
    expect(response.statusCode).toBe(200);
    const results = response.json().results as Array<{
      project: Record<string, unknown>;
      report: { counts: Record<string, number>; notices: unknown[]; problems: unknown[] };
      imagesNotImported: number;
    }>;
    expect(results.map((r) => r.project.title)).toEqual([
      "L'Ancora di Sabaoth",
      'Il pozzo di Ganzirri',
      'Le ali',
      'Lista della spesa',
    ]);
    expect(results.map((r) => r.project.status)).toEqual(['draft', 'draft', 'draft', 'draft']);
    expect(results[0]!.project).toMatchObject({ category: 'one-shot', todoTotal: 9, scenes: 5, system: 'Kulthos' });
    expect(results[1]!.project.system).toBe('');
    expect(results[0]!.report.counts).toEqual(expect.any(Object));
    expect(results[1]!.imagesNotImported).toBe(2);
    expect(results[2]!.project.campaignId).toBe(campaign.id);
    expect(results[3]!.project.campaignId).toBeNull();

    const pozzo = readDocument((await loadProjectDoc(db, results[1]!.project.id as string))!);
    expect(pozzo).toContain('![pozzo](../_resources/pozzo.jpg)');
    expect(pozzo).toContain('<img src="_resources/mappa.png" width="300">');
    expect(await list()).toHaveLength(5);
  });

  it('never merges: a note with an existing title becomes a second project', async () => {
    const { create, call, list } = await signedInApi();
    await create({ category: 'one-shot', title: 'Il pozzo di Ganzirri' });
    await call('POST', '/api/import', { notes: [{ text: joplinNote, fileName: 'pozzo.md', category: 'one-shot' }] });
    expect((await list()).map((p) => p.title)).toEqual(['Il pozzo di Ganzirri', 'Il pozzo di Ganzirri']);
  });

  it('imports all the notes or none', async () => {
    const { call, list } = await signedInApi();
    const response = await call('POST', '/api/import', {
      notes: [
        { text: joplinNote, fileName: 'pozzo.md', category: 'one-shot' },
        { text: joplinNote, fileName: 'pozzo.md', category: 'one-shot', campaignId: crypto.randomUUID() },
      ],
    });
    expect(response.statusCode).toBe(400);
    expect(await list()).toEqual([]);
    expect((await call('POST', '/api/import', { notes: [{ text: 'x', fileName: 'x.md' }] })).statusCode).toBe(400);
    expect((await call('POST', '/api/import', { notes: [] })).statusCode).toBe(400);
  });

  it('takes a body larger than the default limit', async () => {
    const { call } = await signedInApi();
    // Paragraphs, as in a real note: one paragraph of this size is slow to
    // parse in the format package.
    const big = `# Grande\n\n${'Una riga di testo per riempire il documento.\n\n'.repeat(25_000)}`;
    expect(big.length).toBeGreaterThan(1024 * 1024);
    const response = await call('POST', '/api/import', { notes: [{ text: big, fileName: 'grande.md', category: 'one-shot' }] });
    expect(response.statusCode).toBe(200);
  });
});

describe('export', () => {
  it('exports one project as a folder in a zip', async () => {
    const { create, call } = await signedInApi();
    const campaign = await create({ category: 'campaign', title: 'Blacksad - Il Continentale' });
    const project = await create({
      category: 'adventure',
      title: 'Pioggia su: Kenmore Street',
      campaignId: campaign.id,
      seed: 'Un pugile scompare.',
    });
    const response = await call('GET', `/api/projects/${project.id}/export`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="Pioggia su- Kenmore Street.zip"; filename*=UTF-8''Pioggia%20su-%20Kenmore%20Street.zip`,
    );
    const files = unzipSync(response.rawPayload);
    expect(Object.keys(files).filter((path) => !path.endsWith('/')).sort()).toEqual([
      'Pioggia su- Kenmore Street/document.md',
      'Pioggia su- Kenmore Street/project.json',
      'Pioggia su- Kenmore Street/seed.md',
      'Pioggia su- Kenmore Street/todo.md',
    ]);
    const json = JSON.parse(strFromU8(files['Pioggia su- Kenmore Street/project.json']!));
    expect(json).toMatchObject({ id: project.id, campaign: 'Blacksad - Il Continentale', schema: 1, editedAt: project.editedAt });
    expect(strFromU8(files['Pioggia su- Kenmore Street/seed.md']!)).toContain('Un pugile scompare.');
    expect(strFromU8(files['Pioggia su- Kenmore Street/todo.md']!)).toMatch(/^- \[ \] Scrivere le scene\n/);
    expect(strFromU8(files['Pioggia su- Kenmore Street/document.md']!)).toBe(
      readDocument((await loadProjectDoc(db, project.id))!),
    );
  });

  it('exports every project not in the bin, with unique folder names', async () => {
    const { create, call } = await signedInApi();
    await create({ category: 'one-shot', title: 'Doppio' });
    await create({ category: 'one-shot', title: 'Doppio' });
    const binned = await create({ category: 'one-shot', title: 'Nel cestino' });
    await call('DELETE', `/api/projects/${binned.id}`);
    const response = await call('GET', '/api/export');
    expect(response.statusCode).toBe(200);
    const folders = new Set(Object.keys(unzipSync(response.rawPayload)).map((path) => path.split('/')[0]));
    expect([...folders].sort()).toEqual(['Doppio', 'Doppio (2)']);
    expect(response.headers['content-disposition']).toMatch(/filename="promptbook-\d{4}-\d{2}-\d{2}\.zip"/);
  });

  it('round-trips an imported document byte for byte', async () => {
    const { call } = await signedInApi();
    const first = (
      await call('POST', '/api/import', {
        notes: [{ text: fixture('l-ancora-di-sabaoth.md'), fileName: 'sabaoth.md', category: 'one-shot' }],
      })
    ).json().results[0].project;
    const zip = unzipSync((await call('GET', `/api/projects/${first.id}/export`)).rawPayload);
    const exported = strFromU8(zip["L'Ancora di Sabaoth/document.md"]!);
    const second = (
      await call('POST', '/api/import', { notes: [{ text: exported, fileName: 'document.md', category: 'one-shot' }] })
    ).json().results[0].project;
    expect(readDocument((await loadProjectDoc(db, second.id))!)).toBe(readDocument((await loadProjectDoc(db, first.id))!));
  });
});
