import type { FastifyInstance } from 'fastify';
import { parseAdventure, templates, type AdventureTemplate, type TemplateInput } from 'promptbook-format';
import { defaultSettings, readDocument, readMeta, updateEdits } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createUser } from '../../src/accounts/users.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve } from './helpers.js';
import { mcpCallTool } from './mcp-helpers.js';
import { connect } from './oauth-helpers.js';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

function api(app: FastifyInstance, token: string) {
  const call = (method: Method, url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { cookie: `pb_session=${token}`, origin: ORIGIN },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  return {
    call,
    async duplicate(from: { id: string; version: number }, name: string) {
      const response = await call('POST', '/api/templates', { from, name });
      if (response.statusCode !== 201) throw new Error(`Duplicate failed: ${response.statusCode} ${response.body}`);
      return response.json() as { id: string; version: number; body: AdventureTemplate; note: string; createdAt: string };
    },
    save(id: string, baseVersion: number, body: unknown, note = '') {
      return call('POST', `/api/templates/${id}/versions`, { baseVersion, body, note });
    },
    async list() {
      const r = await call('GET', '/api/templates');
      if (r.statusCode !== 200) throw new Error(`List failed: ${r.statusCode} ${r.body}`);
      return r.json() as {
        templates: { id: string; version: number; body: AdventureTemplate; note: string }[];
        usage: Record<string, number>;
      };
    },
    async create(body: Record<string, unknown>) {
      const response = await call('POST', '/api/projects', body);
      if (response.statusCode !== 201) throw new Error(`Create failed: ${response.statusCode} ${response.body}`);
      return response.json().project as { id: string; errors: number; warnings: number };
    },
  };
}

async function twoAccounts() {
  await steve();
  await createUser(db, { username: 'anna', password: PASSWORD });
  const app = await startApp();
  const session = await signedIn(app);
  return { app, session, steve: api(app, session), anna: api(app, await signedIn(app, 'anna')) };
}

async function storedDoc(id: string): Promise<Y.Doc> {
  const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, row!.state);
  return doc;
}

const AVVENTURA = { id: 'avventura', version: 1 };
const CAMPAGNA = { id: 'campagna', version: 1 };

// A body as the editor sends it: the saved one with a change.
const edited = (body: AdventureTemplate, change: (t: TemplateInput & { kind: 'adventure' }) => void) => {
  const copy = JSON.parse(JSON.stringify(body)) as TemplateInput & { kind: 'adventure' };
  change(copy);
  return copy;
};

describe('duplicating a template', () => {
  it('copies a built-in as version 1 of a new template, every item with a uid', async () => {
    const { steve } = await twoAccounts();
    const copy = await steve.duplicate(AVVENTURA, 'Copia di Avventura');
    expect(copy.id).toMatch(/^t-[0-9a-z]{10}$/);
    expect(copy).toMatchObject({ version: 1, note: '' });
    expect(copy.body).toMatchObject({ id: copy.id, version: 1, name: 'Copia di Avventura', copiedFrom: 'Avventura', kind: 'adventure' });
    for (const items of [copy.body.sections, copy.body.sceneFields, copy.body.callouts, copy.body.meta]) {
      expect(items.every((item) => typeof item.uid === 'string')).toBe(true);
    }
    expect(new Set(copy.body.sections.map((s) => s.uid)).size).toBe(copy.body.sections.length);
    // Apart from the uids and the head, the built-in's definition.
    const strip = (t: object) =>
      JSON.parse(JSON.stringify(t, (key, value) => (['uid', 'id', 'name', 'copiedFrom'].includes(key) ? undefined : value)));
    expect(strip(copy.body)).toEqual(strip(templates.avventura));

    const { templates: listed, usage } = await steve.list();
    expect(listed).toEqual([expect.objectContaining({ id: copy.id, version: 1 })]);
    expect(usage).toEqual({});
  });

  it('copies an own template and a campaign', async () => {
    const { steve } = await twoAccounts();
    const kulthos = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    const again = await steve.duplicate({ id: kulthos.id, version: 1 }, 'One-shot D&D 5e');
    expect(again.id).not.toBe(kulthos.id);
    expect(again.body.copiedFrom).toBe('Avventura Kulthos');
    const lunga = await steve.duplicate(CAMPAGNA, 'Campagna lunga');
    expect(lunga.body).toMatchObject({ kind: 'campaign', copiedFrom: 'Campagna' });
    expect(lunga.body.sections.every((s) => s.uid)).toBe(true);
  });

  it('refuses an unknown template, and another account’s', async () => {
    const { steve, anna } = await twoAccounts();
    const own = await steve.duplicate(AVVENTURA, 'Mia');
    for (const from of [{ id: 'avventura', version: 2 }, { id: 't-0000000000', version: 1 }, { id: own.id, version: 1 }]) {
      const response = await anna.call('POST', '/api/templates', { from, name: 'Copia' });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('template_unknown');
    }
    expect((await anna.list()).templates).toEqual([]);
    const blank = await steve.call('POST', '/api/templates', { from: AVVENTURA, name: '  ' });
    expect(blank.json().error).toBe('validation_error');
  });
});

describe('saving versions', () => {
  it('saves the next version with its note, the id and version from the path', async () => {
    const { steve } = await twoAccounts();
    const v1 = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    const body = edited(v1.body, (t) => {
      t.id = 'avventura';
      t.version = 99;
      t.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
    });
    const response = await steve.save(v1.id, 1, body, 'Apertura');
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: v1.id, version: 2, note: 'Apertura', body: { id: v1.id, version: 2 } });
    const { templates: listed } = await steve.list();
    expect(listed.map((t) => `${t.id}@${t.version}`)).toEqual([`${v1.id}@1`, `${v1.id}@2`]);
    // Version 1 is as it was.
    expect(listed[0]!.body.sections.find((s) => s.role === 'strongStart')!.name).toBe('Inizio forte');
  });

  it('refuses a save from a version that is no longer the latest', async () => {
    const { steve } = await twoAccounts();
    const v1 = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    expect((await steve.save(v1.id, 1, v1.body)).statusCode).toBe(201);
    const stale = await steve.save(v1.id, 1, v1.body);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe('template_version_conflict');
    // Two tabs saving from v2 at once: one makes v3, the other is refused.
    const both = await Promise.all([steve.save(v1.id, 2, v1.body, 'a'), steve.save(v1.id, 2, v1.body, 'b')]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(both.find((r) => r.statusCode === 409)!.json().error).toBe('template_version_conflict');
    expect((await steve.list()).templates.map((t) => t.version)).toEqual([1, 2, 3]);
  });

  it('refuses an invalid body and a change of kind', async () => {
    const { steve } = await twoAccounts();
    const v1 = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    const bad = await steve.save(v1.id, 1, edited(v1.body, (t) => (t.sections[0]!.name = ' ')));
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: 'invalid_template' });
    expect(bad.json().message).toContain('sections[0].name');
    const campaign = { ...JSON.parse(JSON.stringify(templates.campagna)), id: v1.id };
    const kind = await steve.save(v1.id, 1, campaign);
    expect(kind.statusCode).toBe(400);
    expect(kind.json()).toMatchObject({ error: 'invalid_template', message: 'body: kind must stay adventure.' });
    expect((await steve.list()).templates).toHaveLength(1);
  });

  it('answers not found for another account’s template, a built-in and an unknown id', async () => {
    const { steve, anna } = await twoAccounts();
    const v1 = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    for (const id of [v1.id, 'avventura', 't-0000000000', '..']) {
      const response = await anna.save(id, 1, v1.body);
      expect(response.statusCode).toBe(404);
    }
    expect((await steve.list()).templates).toHaveLength(1);
  });
});

describe('deleting a template', () => {
  it('deletes every version of an unused template; refuses one in use; leaves another account’s alone', async () => {
    const { steve, anna } = await twoAccounts();
    const unused = await steve.duplicate(AVVENTURA, 'Prova');
    await steve.save(unused.id, 1, unused.body);
    expect((await anna.call('DELETE', `/api/templates/${unused.id}`)).statusCode).toBe(404);
    expect((await steve.call('DELETE', `/api/templates/${unused.id}`)).statusCode).toBe(204);
    expect((await steve.list()).templates).toEqual([]);
    expect((await steve.call('DELETE', `/api/templates/${unused.id}`)).statusCode).toBe(404);

    const used = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    const project = await steve.create({ category: 'one-shot', title: 'Prova', template: { id: used.id, version: 1 } });
    const refused = await steve.call('DELETE', `/api/templates/${used.id}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: 'template_in_use', message: 'The template is used by 1 project.' });
    // In the bin, the project still counts: it can be restored.
    expect((await steve.call('DELETE', `/api/projects/${project.id}`)).statusCode).toBe(204);
    expect((await steve.call('DELETE', `/api/templates/${used.id}`)).statusCode).toBe(409);
    // Gone for good, it no longer does.
    await db.query('delete from projects where id = $1', [project.id]);
    expect((await steve.call('DELETE', `/api/templates/${used.id}`)).statusCode).toBe(204);
  });
});

describe('races', () => {
  it('never brings back a template deleted while a save ran', async () => {
    const { steve } = await twoAccounts();
    for (let i = 0; i < 5; i++) {
      const v1 = await steve.duplicate(AVVENTURA, `Prova ${i}`);
      const [saved, deleted] = await Promise.all([steve.save(v1.id, 1, v1.body), steve.call('DELETE', `/api/templates/${v1.id}`)]);
      expect(deleted.statusCode).toBe(204);
      expect([201, 404]).toContain(saved.statusCode);
      expect((await steve.list()).templates.filter((t) => t.id === v1.id)).toEqual([]);
    }
  });

  it('never leaves a new project on a template deleted while it was created', async () => {
    const { steve } = await twoAccounts();
    for (let i = 0; i < 5; i++) {
      const v1 = await steve.duplicate(AVVENTURA, `Prova ${i}`);
      const [created, deleted] = await Promise.all([
        steve.call('POST', '/api/projects', { category: 'one-shot', title: `P${i}`, template: { id: v1.id, version: 1 } }),
        steve.call('DELETE', `/api/templates/${v1.id}`),
      ]);
      const outcome = `${created.statusCode}/${deleted.statusCode}`;
      expect(['201/409', '400/204']).toContain(outcome);
      if (created.statusCode === 400) expect(created.json().error).toBe('template_unknown');
      const pinned = await db.query('select id from projects where template_id = $1', [v1.id]);
      const kept = (await steve.list()).templates.some((t) => t.id === v1.id);
      // A project on it means the template is still there.
      expect(pinned.length === 0 || kept).toBe(true);
    }
  });
});

describe('usage', () => {
  it('counts the projects per version, in the bin, built-ins and rows that record none included', async () => {
    const { steve, anna } = await twoAccounts();
    const own = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    await steve.save(own.id, 1, own.body);
    await steve.create({ category: 'adventure', title: 'Uno' });
    const old = await steve.create({ category: 'one-shot', title: 'Due' });
    await steve.create({ category: 'campaign', title: 'Tre' });
    await steve.create({ category: 'adventure', title: 'Quattro', template: { id: own.id, version: 1 } });
    await steve.create({ category: 'adventure', title: 'Cinque', template: { id: own.id, version: 2 } });
    const binned = await steve.create({ category: 'adventure', title: 'Sei', template: { id: own.id, version: 2 } });
    await steve.call('DELETE', `/api/projects/${binned.id}`);
    await anna.create({ category: 'adventure', title: 'Di Anna' });
    // A row stored before migration 007 records no template.
    await db.query('update projects set template_id = null, template_version = null where id = $1', [old.id]);
    expect((await steve.list()).usage).toEqual({
      'avventura@1': 2,
      'campagna@1': 1,
      [`${own.id}@1`]: 1,
      [`${own.id}@2`]: 2,
    });
    expect((await anna.list()).usage).toEqual({ 'avventura@1': 1 });
  });
});

describe('creating a project from a template', () => {
  it('starts from the chosen version and records it, in the document and the row', async () => {
    const { steve } = await twoAccounts();
    const v1 = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    const v2 = (
      await steve.save(
        v1.id,
        1,
        edited(v1.body, (t) => {
          t.system = 'Kulthos';
          t.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
          const truths = t.sections.findIndex((s) => s.role === 'truths');
          t.sections.splice(truths + 1, 0, { name: 'Atmosfera', requirement: 'optional', uid: 'atmosfera' });
        }),
      )
    ).json() as { body: AdventureTemplate };
    const project = await steve.create({ category: 'adventure', title: 'Il faro', template: { id: v1.id, version: 2 } });
    const doc = await storedDoc(project.id);
    expect(readMeta(doc).template).toEqual({ id: v1.id, version: 2 });
    const text = readDocument(doc);
    expect(text.split('\n').filter((l) => l.startsWith('## '))).toEqual(
      v2.body.sections.map((s) => `## ${s.heading ?? s.name}`),
    );
    expect(text).toContain('\nsistema: Kulthos\n');
    expect(await db.queryOne('select template_id, template_version, system from projects where id = $1', [project.id])).toEqual({
      template_id: v1.id,
      template_version: 2,
      system: 'Kulthos',
    });
    // The row's counts are those of the project's own template.
    const { problems } = parseAdventure(text, { template: v2.body });
    expect(project.errors).toBe(problems.filter((p) => p.severity === 'error').length);
    expect(project.warnings).toBe(problems.filter((p) => p.severity === 'warning').length);
    expect(problems.map((p) => p.code)).not.toContain('section.unknown');
  });

  it('starts from the default in the settings at its latest version, else the built-in', async () => {
    const { steve } = await twoAccounts();
    const own = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    await steve.save(own.id, 1, own.body);
    const settings = { ...defaultSettings(), defaultTemplates: { adventure: own.id, campaign: 'campagna' } };
    expect((await steve.call('PUT', '/api/settings', settings)).statusCode).toBe(200);
    const adventure = await steve.create({ category: 'one-shot', title: 'Uno' });
    expect(readMeta(await storedDoc(adventure.id)).template).toEqual({ id: own.id, version: 2 });
    const campaign = await steve.create({ category: 'campaign', title: 'Due' });
    expect(readMeta(await storedDoc(campaign.id)).template).toEqual(CAMPAGNA);

    // A default that is gone, or of the other kind, reads as the built-in.
    await steve.call('PUT', '/api/settings', { ...settings, defaultTemplates: { adventure: 't-0000000000', campaign: own.id } });
    expect(readMeta(await storedDoc((await steve.create({ category: 'adventure', title: 'Tre' })).id)).template).toEqual(AVVENTURA);
    expect(readMeta(await storedDoc((await steve.create({ category: 'campaign', title: 'Quattro' })).id)).template).toEqual(CAMPAGNA);
  });

  it('refuses an unknown template, one of the other kind, and another account’s', async () => {
    const { steve, anna } = await twoAccounts();
    const own = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    const cases: [string, { id: string; version: number }][] = [
      ['adventure', { id: 'avventura', version: 2 }],
      ['campaign', AVVENTURA],
      ['one-shot', CAMPAGNA],
      ['adventure', { id: own.id, version: 1 }],
    ];
    for (const [category, template] of cases) {
      const response = await anna.call('POST', '/api/projects', { category, title: 'X', template });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('template_unknown');
    }
    expect(await db.query("select id from projects where title = 'X'")).toEqual([]);
  });

  it('is checked against its own template by the connector’s get_outline', async () => {
    const { app, session, steve } = await twoAccounts();
    const v1 = await steve.duplicate(AVVENTURA, 'Avventura Kulthos');
    const v2 = await steve.save(
      v1.id,
      1,
      edited(v1.body, (t) => {
        t.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
      }),
    );
    expect(v2.statusCode).toBe(201);
    const project = await steve.create({ category: 'adventure', title: 'Il faro', template: { id: v1.id, version: 2 } });
    const tokens = await connect(app, session, 'read');
    const outline = (await mcpCallTool(app, tokens.access_token, 'get_outline', { projectId: project.id })).value;
    expect(outline.targets).toContainEqual(expect.objectContaining({ kind: 'section', target: 'Apertura' }));
    expect(outline.errors).toBe(project.errors);
    // The built-in would read «Apertura» as unknown and miss «Inizio forte».
    const text = readDocument(await storedDoc(project.id));
    const builtin = parseAdventure(text, { template: templates.avventura }).problems;
    expect(builtin.map((p) => p.code)).toContain('section.unknown');
    expect(outline.warnings + outline.errors).toBeLessThan(builtin.length);
  });

  it('updates a project to the next version with updateEdits, and the row follows the document', async () => {
    const { steve } = await twoAccounts();
    const v1 = await steve.duplicate(CAMPAGNA, 'Campagna lunga');
    const project = await steve.create({ category: 'campaign', title: 'Apocrypha', template: { id: v1.id, version: 1 } });
    const body = JSON.parse(JSON.stringify(v1.body)) as TemplateInput;
    body.sections.find((s) => s.name === 'Fronti')!.name = 'Minacce';
    const v2 = (await steve.save(v1.id, 1, body)).json() as { body: AdventureTemplate };
    const text = readDocument(await storedDoc(project.id));
    // The duplicate's uids pair «Fronti» with «Minacce»: a rename, not an add.
    const edits = updateEdits(text, v1.body, v2.body, { addSections: true, renameHeadings: true });
    expect(edits).toEqual([expect.objectContaining({ insert: 'Minacce' })]);
  });
});

describe('settings', () => {
  it('saves settings without defaultTemplates, as a v0.12 desktop app sends them, reading the built-ins', async () => {
    const { steve } = await twoAccounts();
    const { defaultTemplates: _defaults, ...old } = { ...defaultSettings(), author: 'Stefano Sibilia' };
    const put = await steve.call('PUT', '/api/settings', old);
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ ...old, defaultTemplates: { adventure: 'avventura', campaign: 'campagna' } });
    expect((await steve.call('GET', '/api/settings')).json().defaultTemplates).toEqual({
      adventure: 'avventura',
      campaign: 'campagna',
    });
    // And a stored row from before, without the key, reads the same.
    await db.query("update user_settings set settings = settings - 'defaultTemplates'");
    expect((await steve.call('GET', '/api/settings')).json()).toMatchObject({
      author: 'Stefano Sibilia',
      defaultTemplates: { adventure: 'avventura', campaign: 'campagna' },
    });
  });

  it('keeps the stored defaults when a v0.12 desktop app saves without them', async () => {
    const { steve } = await twoAccounts();
    const chosen = { adventure: 't-0123456789', campaign: 'campagna' };
    await steve.call('PUT', '/api/settings', { ...defaultSettings(), defaultTemplates: chosen });
    const { defaultTemplates: _defaults, ...old } = { ...defaultSettings(), author: 'Dal desktop' };
    const put = await steve.call('PUT', '/api/settings', old);
    expect(put.json()).toMatchObject({ author: 'Dal desktop', defaultTemplates: chosen });
    expect((await steve.call('GET', '/api/settings')).json().defaultTemplates).toEqual(chosen);
  });

  it('keeps the defaults it was given, and refuses a malformed one', async () => {
    const { steve } = await twoAccounts();
    const settings = { ...defaultSettings(), defaultTemplates: { adventure: 't-0123456789', campaign: 'campagna' } };
    expect((await steve.call('PUT', '/api/settings', settings)).json()).toEqual(settings);
    for (const defaultTemplates of [{ adventure: 'avventura' }, { adventure: '', campaign: 'campagna' }, 'avventura']) {
      const response = await steve.call('PUT', '/api/settings', { ...settings, defaultTemplates });
      expect(response.statusCode).toBe(400);
    }
  });
});
