import type { FastifyInstance } from 'fastify';
import { templates, type AdventureTemplate, type TemplateInput } from 'promptbook-format';
import { defaultSettings, readDocument, readMeta } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { db, ORIGIN, signedIn, startApp, steve } from './helpers.js';
import { mcpCallTool, mcpListTools } from './mcp-helpers.js';
import { connect } from './oauth-helpers.js';

// The connector's template tools (template-connector design decisions 1 to
// 8), called as Claude calls them, the app's REST routes alongside.

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Body = TemplateInput & { kind: 'adventure' };

async function setup(scope: 'read' | 'read_write' = 'read_write') {
  await steve();
  const app: FastifyInstance = await startApp();
  const session = await signedIn(app);
  const tokens = await connect(app, session, scope);
  const rest = (method: Method, url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { cookie: `pb_session=${session}`, origin: ORIGIN },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  const call = (name: string, args: Record<string, unknown> = {}) => mcpCallTool(app, tokens.access_token, name, args);
  const list = () => mcpListTools(app, tokens.access_token);
  // A tool that must succeed: its answer.
  const value = async (name: string, args: Record<string, unknown> = {}) => {
    const outcome = await call(name, args);
    if (outcome.isError) throw new Error(`${name} failed: ${JSON.stringify(outcome.error ?? outcome.rpcError)}`);
    return outcome.value;
  };
  return { app, session, rest, call, value, list };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const errorOf = async (s: Setup, name: string, args: Record<string, unknown>) => (await s.call(name, args)).error;

async function storedDoc(id: string): Promise<Y.Doc> {
  const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, row!.state);
  return doc;
}

const rows = (id: string) =>
  db.query<{ version: number; note: string }>('select version, note from document_templates where id = $1 order by version', [id]);

const copyOf = (body: AdventureTemplate) => JSON.parse(JSON.stringify(body)) as Body;

// «Avventura Kulthos» v2: «Inizio forte» renamed «Apertura», «Atmosfera»
// added after «Verità del mondo».
function kulthosV2(v1: AdventureTemplate): Body {
  const body = copyOf(v1);
  body.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
  const truths = body.sections.findIndex((s) => s.role === 'truths');
  body.sections.splice(truths + 1, 0, { name: 'Atmosfera', requirement: 'optional' });
  return body;
}

async function kulthos(s: Setup) {
  const copy = await s.value('duplicate_template', { from: { id: 'avventura' }, name: 'Avventura Kulthos' });
  const read = await s.value('get_template', { templateId: copy.id });
  return { id: copy.id as string, v1: read.template as AdventureTemplate };
}

async function createProject(s: Setup, body: Record<string, unknown>) {
  const response = await s.rest('POST', '/api/projects', body);
  if (response.statusCode !== 201) throw new Error(`Create failed: ${response.statusCode} ${response.body}`);
  return response.json().project.id as string;
}

describe('the template tools in the list', () => {
  it('lists two read tools, three write tools and one destructive write tool', async () => {
    const s = await setup();
    const tools = await s.list();
    const hints = (name: string) => {
      const a = tools.find((t) => t.name === name)!.annotations!;
      return [a.readOnlyHint, a.idempotentHint, a.destructiveHint, a.openWorldHint];
    };
    expect(hints('list_templates')).toEqual([true, true, false, false]);
    expect(hints('get_template')).toEqual([true, true, false, false]);
    expect(hints('duplicate_template')).toEqual([false, false, false, false]);
    expect(hints('save_template_version')).toEqual([false, false, false, false]);
    expect(hints('delete_template')).toEqual([false, true, true, false]);
    expect(hints('update_project_template')).toEqual([false, true, false, false]);
    expect(tools.find((t) => t.name === 'create_project')!.inputSchema?.properties).toHaveProperty('template');
  });
});

describe('reading templates', () => {
  it('lists the built-ins first, then the account’s by name at their latest version, with default, versions and use', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    await s.value('save_template_version', { templateId: id, baseVersion: 1, body: kulthosV2(v1), note: 'apertura' });
    const zeta = await s.value('duplicate_template', { from: { id: 'campagna' }, name: 'Zeta' });
    await s.rest('PUT', '/api/settings', { ...defaultSettings(), defaultTemplates: { adventure: id, campaign: 'campagna' } });
    await createProject(s, { category: 'one-shot', title: 'Prova', template: { id, version: 1 } });
    const bin = await createProject(s, { category: 'adventure', title: 'Cestino', template: { id, version: 2 } });
    await s.rest('DELETE', `/api/projects/${bin}`);

    const { templates: listed } = await s.value('list_templates');
    expect(listed.map((t: { name: string }) => t.name)).toEqual(['Avventura', 'Campagna', 'Avventura Kulthos', 'Zeta']);
    expect(listed[0]).toEqual({
      id: 'avventura',
      name: 'Avventura',
      kind: 'adventure',
      version: 1,
      builtin: true,
      copiedFrom: null,
      default: false,
      projects: 0,
      versions: [{ version: 1, note: '', createdAt: null }],
    });
    expect(listed[1]).toMatchObject({ id: 'campagna', builtin: true, default: true });
    expect(listed[2]).toMatchObject({
      id,
      kind: 'adventure',
      version: 2,
      builtin: false,
      copiedFrom: 'Avventura',
      default: true,
      projects: 2,
      versions: [
        { version: 1, note: '' },
        { version: 2, note: 'via Claude: apertura' },
      ],
    });
    expect(listed[3]).toMatchObject({ id: zeta.id, kind: 'campaign', default: false, projects: 0 });
    const { templates: campaigns } = await s.value('list_templates', { kind: 'campaign' });
    expect(campaigns.map((t: { name: string }) => t.name)).toEqual(['Campagna', 'Zeta']);
  });

  it('reads a template at its latest version or the one asked for, built-ins included, and names an unknown one', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    await s.value('save_template_version', { templateId: id, baseVersion: 1, body: kulthosV2(v1) });
    await createProject(s, { category: 'adventure', title: 'Prova', template: { id, version: 1 } });

    const latest = await s.value('get_template', { templateId: id });
    expect(latest).toMatchObject({ id, version: 2, latestVersion: 2, builtin: false, note: 'via Claude', projects: 0 });
    expect(latest.template.sections.find((x: { role?: string }) => x.role === 'strongStart').name).toBe('Apertura');
    const first = await s.value('get_template', { templateId: id, version: 1 });
    expect(first).toMatchObject({ version: 1, latestVersion: 2, projects: 1 });
    expect(first.template).toEqual(v1);
    const builtin = await s.value('get_template', { templateId: 'avventura' });
    expect(builtin).toMatchObject({ id: 'avventura', version: 1, latestVersion: 1, builtin: true, note: '', createdAt: null });
    expect(builtin.template).toEqual(JSON.parse(JSON.stringify(templates.avventura)));

    for (const args of [{ templateId: id, version: 3 }, { templateId: 'avventura', version: 2 }, { templateId: 't-0000000000' }]) {
      expect(await errorOf(s, 'get_template', args)).toMatchObject({
        code: 'not_found',
        message: 'No template with that id and version. list_templates shows yours.',
      });
    }
  });
});

describe('copying and deleting', () => {
  it('copies a built-in and an own template at their latest version, or the one asked for', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    expect((await s.value('get_template', { templateId: id })).template.copiedFrom).toBe('Avventura');
    await s.value('save_template_version', { templateId: id, baseVersion: 1, body: kulthosV2(v1) });

    const latest = await s.value('duplicate_template', { from: { id }, name: 'Kulthos bis' });
    expect(latest).toEqual({ id: expect.stringMatching(/^t-[0-9a-z]{10}$/), version: 1, name: 'Kulthos bis', copiedFrom: 'Avventura Kulthos' });
    const copied = (await s.value('get_template', { templateId: latest.id })).template as AdventureTemplate;
    expect(copied.sections.some((x) => x.name === 'Apertura')).toBe(true);
    const first = await s.value('duplicate_template', { from: { id, version: 1 }, name: 'Kulthos ter' });
    const old = (await s.value('get_template', { templateId: first.id })).template as AdventureTemplate;
    expect(old.sections.some((x) => x.name === 'Inizio forte')).toBe(true);

    expect(await errorOf(s, 'duplicate_template', { from: { id: 't-0000000000' }, name: 'x' })).toMatchObject({
      code: 'template_unknown',
    });
  });

  it('deletes an unused template; refuses one a project in the bin uses, and a built-in', async () => {
    const s = await setup();
    const { id } = await kulthos(s);
    const unused = await s.value('duplicate_template', { from: { id: 'avventura' }, name: 'Prova' });
    expect(await s.value('delete_template', { templateId: unused.id })).toEqual({ deleted: unused.id });
    expect(await rows(unused.id)).toEqual([]);

    const project = await createProject(s, { category: 'adventure', title: 'Prova', template: { id, version: 1 } });
    await s.rest('DELETE', `/api/projects/${project}`);
    expect(await errorOf(s, 'delete_template', { templateId: id })).toMatchObject({
      code: 'template_in_use',
      message: 'The template is used by 1 project.',
    });
    expect(await rows(id)).toHaveLength(1);
    expect(await errorOf(s, 'delete_template', { templateId: 'avventura' })).toMatchObject({ code: 'not_found' });
  });
});

describe('saving a version', () => {
  it('saves the whole body as the next version, the note prefixed, new rows with a uid, the changes listed', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    const project = await createProject(s, { category: 'adventure', title: 'Prova', template: { id, version: 1 } });
    const saved = await s.value('save_template_version', {
      templateId: id,
      baseVersion: 1,
      body: kulthosV2(v1),
      note: 'mood section',
    });
    expect(saved).toEqual({
      id,
      version: 2,
      note: 'via Claude: mood section',
      changes: [
        { kind: 'added', what: 'section', label: 'Atmosfera', after: 'optional' },
        { kind: 'changed', what: 'section', label: 'Apertura', before: 'Inizio forte', detail: 'renamed' },
      ],
    });
    const v2 = (await s.value('get_template', { templateId: id })).template as AdventureTemplate;
    expect(v2.sections.find((x) => x.name === 'Atmosfera')!.uid).toMatch(/^[0-9a-f-]{36}$/);
    expect(await rows(id)).toEqual([
      { version: 1, note: '' },
      { version: 2, note: 'via Claude: mood section' },
    ]);
    // The project stays on v1.
    expect(readMeta(await storedDoc(project)).template).toEqual({ id, version: 1 });
  });

  it('keeps the uids of rows sent back without them, so a rename stays a rename', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    const project = await createProject(s, { category: 'adventure', title: 'Prova', template: { id, version: 1 } });
    const strip = (body: Body) => {
      for (const items of [body.sections, body.sceneFields, body.callouts, body.meta] as { uid?: string }[][]) {
        for (const item of items) delete item.uid;
      }
      return body;
    };
    expect(await errorOf(s, 'save_template_version', { templateId: id, baseVersion: 1, body: strip(copyOf(v1)) })).toMatchObject({
      code: 'no_changes',
    });
    const saved = await s.value('save_template_version', { templateId: id, baseVersion: 1, body: strip(kulthosV2(v1)) });
    expect(saved.changes).toEqual([
      { kind: 'added', what: 'section', label: 'Atmosfera', after: 'optional' },
      { kind: 'changed', what: 'section', label: 'Apertura', before: 'Inizio forte', detail: 'renamed' },
    ]);
    const v2 = (await s.value('get_template', { templateId: id })).template as AdventureTemplate;
    expect(v2.sections.find((x) => x.role === 'strongStart')!.uid).toBe(v1.sections.find((x) => x.role === 'strongStart')!.uid);
    const updated = await s.value('update_project_template', { projectId: project });
    const text = readDocument(await storedDoc(project));
    expect(updated.edits).toBe(2);
    expect(text.match(/^## Scene$/gm)).toHaveLength(1);
    expect(text).toContain('## Apertura');
  });

  it('refuses a built-in, a stale base, an unchanged body and a lock broken, saving nothing', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    expect(
      await errorOf(s, 'save_template_version', { templateId: 'avventura', baseVersion: 1, body: copyOf(templates.avventura) }),
    ).toMatchObject({ code: 'not_found' });
    expect(await errorOf(s, 'save_template_version', { templateId: id, baseVersion: 1, body: copyOf(v1) })).toEqual({
      code: 'no_changes',
      message: 'body: is the same as version 1.',
    });
    const noScenes = copyOf(v1);
    noScenes.sections = noScenes.sections.filter((x) => x.role !== 'scenes');
    expect(await errorOf(s, 'save_template_version', { templateId: id, baseVersion: 1, body: noScenes })).toEqual({
      code: 'invalid_template',
      message: 'body: section «Scene» is locked: it cannot be removed.',
    });
    expect(await rows(id)).toHaveLength(1);
    // The app saves v2 meanwhile.
    expect((await s.rest('POST', `/api/templates/${id}/versions`, { baseVersion: 1, body: kulthosV2(v1), note: '' })).statusCode).toBe(201);
    expect(await errorOf(s, 'save_template_version', { templateId: id, baseVersion: 1, body: kulthosV2(v1) })).toMatchObject({
      code: 'template_version_conflict',
    });
    expect(await rows(id)).toHaveLength(2);
  });

  it('refuses a body over the limit and a note over 400 characters by their schema', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    const big = { ...kulthosV2(v1), padding: 'x'.repeat(100_000) };
    // The SDK refuses input its schema rejects before the tool runs, in words.
    const tooBig = await s.call('save_template_version', { templateId: id, baseVersion: 1, body: big });
    expect(tooBig).toMatchObject({ isError: true, text: expect.stringContaining('body: must be at most 100000 characters as JSON') });
    const longNote = await s.call('save_template_version', { templateId: id, baseVersion: 1, body: kulthosV2(v1), note: 'n'.repeat(401) });
    expect(longNote).toMatchObject({ isError: true, text: expect.stringContaining('note: Too big') });
    expect(await rows(id)).toHaveLength(1);
  });

  it('refuses every write tool to a read-only client', async () => {
    const s = await setup('read');
    const writes: [string, Record<string, unknown>][] = [
      ['duplicate_template', { from: { id: 'avventura' }, name: 'x' }],
      ['save_template_version', { templateId: 't-0000000000', baseVersion: 1, body: {} }],
      ['delete_template', { templateId: 't-0000000000' }],
      ['update_project_template', { projectId: 'x' }],
    ];
    for (const [name, args] of writes) expect((await errorOf(s, name, args))?.code, name).toBe('insufficient_scope');
    expect((await s.call('list_templates')).isError).toBe(false);
    expect((await s.call('get_template', { templateId: 'avventura' })).isError).toBe(false);
  });
});

describe('projects and templates', () => {
  it('creates a project on a template’s latest version and names it in get_project; refuses one of another kind', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    await s.value('save_template_version', { templateId: id, baseVersion: 1, body: kulthosV2(v1) });
    const created = await s.value('create_project', { title: 'La fiera di Randazzo', category: 'adventure', template: { id } });
    expect(readMeta(await storedDoc(created.id)).template).toEqual({ id, version: 2 });
    expect(readDocument(await storedDoc(created.id))).toContain('## Apertura');
    expect((await s.value('get_project', { projectId: created.id })).template).toEqual({
      id,
      version: 2,
      name: 'Avventura Kulthos',
      builtin: false,
      latestVersion: 2,
    });
    const pinned = await s.value('create_project', { title: 'Vecchia', category: 'one-shot', template: { id, version: 1 } });
    expect((await s.value('get_project', { projectId: pinned.id })).template).toMatchObject({ version: 1, latestVersion: 2 });
    const plain = await s.value('create_project', { title: 'Semplice', category: 'adventure' });
    expect((await s.value('get_project', { projectId: plain.id })).template).toEqual({
      id: 'avventura',
      version: 1,
      name: 'Avventura',
      builtin: true,
      latestVersion: 1,
    });
    expect(await errorOf(s, 'create_project', { title: 'x', category: 'campaign', template: { id } })).toMatchObject({
      code: 'template_unknown',
    });
  });

  it('moves a project to the latest version: new section, renamed heading, version, a Claude snapshot first', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    const project = await createProject(s, { category: 'adventure', title: 'Prova', template: { id, version: 1 } });
    const before = readDocument(await storedDoc(project));
    expect(before).toContain('## Inizio forte');
    await s.value('save_template_version', { templateId: id, baseVersion: 1, body: kulthosV2(v1) });

    const updated = await s.value('update_project_template', { projectId: project });
    expect(updated).toMatchObject({
      template: { id, name: 'Avventura Kulthos', from: 1, to: 2 },
      edits: 2,
      snapshotId: expect.any(String),
      errors: expect.any(Number),
      warnings: expect.any(Number),
    });
    expect(updated.changes.map((c: { label: string }) => c.label)).toEqual(['Atmosfera', 'Apertura']);
    const doc = await storedDoc(project);
    const text = readDocument(doc);
    expect(text).toContain('## Apertura');
    expect(text).not.toContain('## Inizio forte');
    expect(text).toMatch(/## Verità del mondo[\s\S]*## Atmosfera[\s\S]*## Apertura/);
    expect(readMeta(doc).template).toEqual({ id, version: 2 });
    const snapshot = await db.queryOne<{ kind: string; label: string; text: string; tool: string; target: string | null }>(
      'select kind, label, text, tool, target from snapshots where id = $1',
      [updated.snapshotId],
    );
    expect(snapshot).toEqual({
      kind: 'claude',
      label: 'Template «Avventura Kulthos» v1 → v2',
      text: before,
      tool: 'update_project_template',
      target: null,
    });
    // Restore, not Undo, takes it back.
    const undo = await s.rest('POST', `/api/projects/${project}/snapshots/${updated.snapshotId}/undo`);
    expect(undo.json().error).toBe('not_undoable');

    expect(await errorOf(s, 'update_project_template', { projectId: project })).toMatchObject({
      code: 'template_up_to_date',
      message: 'The project already uses the latest version of its template.',
    });
  });

  it('only records the version when there is nothing to add or rename, and keeps the options', async () => {
    const s = await setup();
    const { id, v1 } = await kulthos(s);
    const quiet = await createProject(s, { category: 'adventure', title: 'Prova', template: { id, version: 1 } });
    const body = copyOf(v1);
    body.sections.find((x) => x.role === 'rules')!.requirement = 'required';
    await s.value('save_template_version', { templateId: id, baseVersion: 1, body });
    const before = readDocument(await storedDoc(quiet));
    const updated = await s.value('update_project_template', { projectId: quiet });
    expect(updated).toMatchObject({ edits: 0, snapshotId: null, template: { from: 1, to: 2 } });
    expect(readDocument(await storedDoc(quiet))).toBe(before);
    expect(readMeta(await storedDoc(quiet)).template).toEqual({ id, version: 2 });
    expect(await db.query('select 1 from snapshots where project_id = $1', [quiet])).toEqual([]);

    // With both options off, a rename and a new section only move the version.
    const kept = await createProject(s, { category: 'adventure', title: 'Prova', template: { id, version: 2 } });
    const v2 = (await s.value('get_template', { templateId: id })).template as AdventureTemplate;
    await s.value('save_template_version', { templateId: id, baseVersion: 2, body: kulthosV2(v2) });
    const off = await s.value('update_project_template', { projectId: kept, addSections: false, renameHeadings: false });
    expect(off).toMatchObject({ edits: 0, snapshotId: null, template: { from: 2, to: 3 } });
    expect(readDocument(await storedDoc(kept))).toContain('## Inizio forte');
  });

  it('refuses a project on a built-in, and one whose template is gone', async () => {
    const s = await setup();
    const builtin = await createProject(s, { category: 'adventure', title: 'Prova' });
    expect(await errorOf(s, 'update_project_template', { projectId: builtin })).toMatchObject({ code: 'template_up_to_date' });
    const { id } = await kulthos(s);
    const orphan = await createProject(s, { category: 'adventure', title: 'Orfano', template: { id, version: 1 } });
    // A template deleted under a project: only possible behind the app's back.
    await db.query('delete from document_templates where id = $1', [id]);
    expect(await errorOf(s, 'update_project_template', { projectId: orphan })).toMatchObject({ code: 'template_unknown' });
    expect(await errorOf(s, 'update_project_template', { projectId: 'nessuno' })).toMatchObject({ code: 'not_found' });
  });
});
