import type { FastifyInstance } from 'fastify';
import { parseAdventure, templates, type Problem } from 'promptbook-format';
import {
  findTarget,
  hideProblem,
  problemKey,
  readDocument,
  readLog,
  readNotes,
  readTodo,
  readTopics,
  setGdrarchive,
  SNOOZE_MS,
} from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createUser, type User } from '../../src/accounts/users.js';
import { buildApp } from '../../src/app.js';
import type { Db } from '../../src/db.js';
import { withLiveDocument, setDocumentText } from '../../src/live.js';
import { check, HEADING_LINE_MAX } from '../../src/mcp/edits.js';
import { WriteQuota } from '../../src/mcp/quota.js';
import { CLAUDE_SNAPSHOTS_MAX } from '../../src/snapshots.js';
import { TOOL_NAMES } from '../../src/mcp/tools.js';
import { textHash } from '../../src/snapshots.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve, testConfig } from './helpers.js';
import { mcpCall, mcpCallTool, mcpInitialize, mcpListTools } from './mcp-helpers.js';
import { connect as connectClient, cookie, FORM, form, type Tokens } from './oauth-helpers.js';
import { connect, destroyClients, listen, synced, waitFor } from './sync-helpers.js';

// No hides, and a fixed clock for the direct calls of check().
const NONE = new Map();
const NOW = new Date();

const METADATA_URL = `${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`;

const scene = (id: string, title: string, lead: string, place: string) =>
  [`### ${id}. ${title}`, '', '> [!leggi]', `> ${lead}`, '', `**Luogo e momento:** ${place}`].join('\n');

// A small adventure: two scenes with their read-aloud boxes, between two
// sections.
const ADVENTURE = [
  '## Orologio',
  '',
  'Prima scossa a mezzanotte.',
  '',
  '## Scene',
  '',
  scene('S1', 'La casa che cede', 'La casa trema.', 'casa Faraci, mezzanotte.'),
  '',
  scene('S2', 'Il molo', 'Il mare è nero.', 'il porto, alba.'),
  '',
  '## Indizi',
  '',
  'Il quaderno di Neri.',
  '',
].join('\n');

// A scene body with every field the template requires: adding it adds no
// error, only the warning of the recommended «Indizi qui».
const FULL_BODY = [
  '> [!leggi]',
  '> La fiera si apre.',
  '',
  '**Luogo e momento:** la piazza, sera.',
  '',
  '**In gioco:** il premio della fiera.',
  '',
  '**Da non perdere qui**',
  '',
  '- Il banco del puparo.',
  '',
  '**Cosa succede da sé**',
  '',
  '- La folla si sposta verso il palco.',
  '',
  '**Se deragliano:** arriva la banda.',
  '',
  '| Se i PG | Allora |',
  '| --- | --- |',
  '| Comprano | Il puparo parla. |',
].join('\n');

const CAMPAIGN = ['# La campagna', '', '## Luoghi', '', 'Il porto.', '', '### Il faro', '', 'Spento.', '', '## Fazioni', '', 'I Neri.', ''].join(
  '\n',
);

interface Setup {
  app: FastifyInstance;
  user: User;
  session: string;
  tokens: Tokens & { clientId: string };
  id: string;
  call(name: string, args?: Record<string, unknown>): ReturnType<typeof mcpCallTool>;
}

async function newProject(app: FastifyInstance, session: string, user: User, category: string, text: string) {
  const created = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { ...cookie(session), origin: ORIGIN },
    payload: { category, title: "L'Ancora di Sabaoth" },
  });
  const id = created.json().project.id as string;
  await withLiveDocument(app.sync, id, user.id, (doc) => setDocumentText(doc, text));
  return id;
}

async function setup(
  { scope = 'read_write', category = 'adventure', text }: { scope?: 'read' | 'read_write'; category?: string; text?: string } = {},
  app?: FastifyInstance,
): Promise<Setup> {
  const user = await steve();
  app ??= await startApp();
  const session = await signedIn(app);
  const id = await newProject(app, session, user, category, text ?? (category === 'campaign' ? CAMPAIGN : ADVENTURE));
  const tokens = await connectClient(app, session, scope);
  return { app, user, session, tokens, id, call: (name, args = {}) => mcpCallTool(app!, tokens.access_token, name, args) };
}

async function storedText(id: string): Promise<string> {
  const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, row!.state);
  return readDocument(doc);
}

async function storedDoc(id: string): Promise<Y.Doc> {
  const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, row!.state);
  return doc;
}

const snapshots = (id: string) =>
  db.query<{ kind: string; label: string; text: string; tool: string; target: string; before_section: string; after_hash: string }>(
    'select kind, label, text, tool, target, before_section, after_hash from snapshots where project_id = $1 order by created_at',
    [id],
  );

describe('the endpoint', () => {
  it('initializes with Promptbook’s name and version, tools only, and no session id', async () => {
    const s = await setup();
    const answer = await mcpInitialize(s.app, s.tokens.access_token);
    expect(answer.status).toBe(200);
    expect(answer.message.result).toMatchObject({ serverInfo: { name: 'promptbook', version: 'dev' } });
    expect(Object.keys(answer.message.result!.capabilities as object)).toEqual(['tools']);
    expect(answer.message.result!.instructions).toContain('read its brainstorm log first');
    expect(answer.headers['mcp-session-id']).toBeUndefined();
  });

  it('lists the 28 tools with JSON schemas, descriptions and annotations, in both protocol eras', async () => {
    const s = await setup();
    for (const era of ['modern', 'legacy'] as const) {
      const tools = await mcpListTools(s.app, s.tokens.access_token, era);
      expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
      for (const tool of tools) {
        expect(tool.description, tool.name).toBeTruthy();
        expect(tool.inputSchema?.type, tool.name).toBe('object');
        expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
        expect(tool.annotations?.destructiveHint, tool.name).toBe(['replace_section', 'remove_image_prompt', 'delete_template'].includes(tool.name));
      }
    }
    const tools = await mcpListTools(s.app, s.tokens.access_token);
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly.sort()).toEqual(
      [
        'get_board',
        'get_brainstorm_log',
        'get_inspiration',
        'get_outline',
        'get_project',
        'get_research_note',
        'get_template',
        'list_projects',
        'list_templates',
        'list_research',
        'list_todo',
        'read_document',
      ].sort(),
    );
    expect(TOOL_NAMES).toHaveLength(28);
    // The two tools that delete something: an image prompt, never a file, and
    // a template no project uses.
    expect(tools.map((t) => t.name).filter((name) => /delete|remove|seed|tick/.test(name)).sort()).toEqual([
      'delete_template',
      'remove_image_prompt',
    ]);
    for (const name of ['list_projects', 'get_project', 'get_brainstorm_log']) {
      expect(tools.find((t) => t.name === name)!.description).toContain('read its brainstorm log first');
    }
  });

  it('refuses unknown argument keys by name', async () => {
    const s = await setup();
    const outcome = await s.call('list_projects', { bogus: 1 });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('bogus');
  });

  it('answers 401 with the resource metadata, and invalid_token when a token was sent', async () => {
    const s = await setup();
    const none = await mcpCall(s.app, 'tools/list', {});
    expect(none.status).toBe(401);
    expect(none.headers['www-authenticate']).toBe(`Bearer resource_metadata="${METADATA_URL}"`);
    for (const token of ['pb_at_never-issued', s.tokens.refresh_token]) {
      const bad = await mcpCall(s.app, 'tools/list', {}, { token });
      expect(bad.status).toBe(401);
      expect(bad.headers['www-authenticate']).toBe(`Bearer resource_metadata="${METADATA_URL}", error="invalid_token"`);
    }
    const malformed = await mcpCall(s.app, 'tools/list', {}, { headers: { authorization: 'Basic abc' } });
    expect(malformed.status).toBe(401);
  });

  it('gives a session cookie alone the same 401 as nothing', async () => {
    const s = await setup();
    const answer = await mcpCall(s.app, 'tools/list', {}, { headers: { ...cookie(s.session), origin: ORIGIN } });
    expect(answer.status).toBe(401);
    expect(answer.headers['www-authenticate']).toBe(`Bearer resource_metadata="${METADATA_URL}"`);
  });

  it('answers 421 to another Host', async () => {
    const s = await setup();
    const answer = await mcpCall(s.app, 'tools/list', {}, { token: s.tokens.access_token, headers: { host: 'evil.example' } });
    expect(answer.status).toBe(421);
  });

  it('answers 405 with Allow: POST to GET, HEAD and DELETE, without a token', async () => {
    const app = await startApp();
    for (const method of ['GET', 'HEAD', 'DELETE'] as const) {
      const response = await app.inject({ method, url: '/api/mcp' });
      expect(response.statusCode, method).toBe(405);
      expect(response.headers.allow, method).toBe('POST');
    }
  });

  it('refuses a body over 1 MB', async () => {
    const s = await setup();
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { host: 'localhost:8090', authorization: `Bearer ${s.tokens.access_token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }),
    });
    expect(response.statusCode).toBe(413);
  });

  it('stops answering once the grant is revoked in Connected apps', async () => {
    const s = await setup();
    expect((await s.call('list_projects')).isError).toBe(false);
    const [grant] = await db.query<{ id: string }>('select id from oauth_grants');
    const revoked = await s.app.inject({
      method: 'DELETE',
      url: `/api/auth/grants/${grant!.id}`,
      headers: { ...cookie(s.session), origin: ORIGIN },
    });
    expect(revoked.statusCode).toBe(204);
    expect((await mcpCall(s.app, 'tools/list', {}, { token: s.tokens.access_token })).status).toBe(401);
  });

  it('answers each request on its own, with no state between them', async () => {
    const s = await setup();
    const first = await mcpListTools(s.app, s.tokens.access_token);
    const second = await mcpListTools(s.app, s.tokens.access_token);
    expect(second.map((t) => t.name)).toEqual(first.map((t) => t.name));
  });
});

describe('who a tool acts as', () => {
  const writes: [string, Record<string, unknown>][] = [
    ['create_project', { title: 'Nuovo', category: 'one-shot' }],
    ['replace_section', { target: 'S1', markdown: '### S1. X', hash: '0'.repeat(64) }],
    ['add_scene', { title: 'Nuova', markdown: '' }],
    ['add_todo', { items: ['Una cosa'] }],
    ['add_inspiration_item', { kind: 'note', text: 'Una nota', why: '' }],
    ['save_research_note', { topic: 'Porti', summary: '', facts: [], sources: [] }],
    ['add_research_topic', { names: ['Porti'] }],
    ['add_brainstorm_entry', { title: 'Sera', ideas: [], decisions: [], rejected: [], questions: [] }],
  ];

  it.each(writes)('refuses %s with a read grant, and changes nothing', async (name, args) => {
    const s = await setup({ scope: 'read' });
    const before = await storedText(s.id);
    const projects = await db.query('select id from projects');
    const outcome = await s.call(name, name === 'create_project' ? args : { projectId: s.id, ...args });
    expect(outcome.isError).toBe(true);
    expect(outcome.error).toMatchObject({ code: 'insufficient_scope', scope_required: 'read_write' });
    expect(outcome.error!.message).toContain('Reconnect');
    expect(await storedText(s.id)).toBe(before);
    expect(await db.query('select id from projects')).toEqual(projects);
    expect(await snapshots(s.id)).toEqual([]);
  });

  it('lets a read grant read', async () => {
    const s = await setup({ scope: 'read' });
    expect((await s.call('read_document', { projectId: s.id })).isError).toBe(false);
  });

  it('answers not_found for another user’s project and for one in the bin, to reads and writes', async () => {
    const s = await setup();
    const anna = await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const annas = await newProject(s.app, await signedIn(s.app, 'anna'), anna, 'adventure', ADVENTURE);
    const binned = await newProject(s.app, s.session, s.user, 'adventure', ADVENTURE);
    await s.app.inject({ method: 'DELETE', url: `/api/projects/${binned}`, headers: { ...cookie(s.session), origin: ORIGIN } });
    for (const projectId of [annas, binned, 'not-an-id']) {
      for (const [name, args] of [
        ['get_project', {}],
        ['read_document', {}],
        ['add_todo', { items: ['x'] }],
        ['add_brainstorm_entry', { title: 'x', ideas: [], decisions: [], rejected: [], questions: [] }],
      ] as const) {
        const outcome = await s.call(name, { projectId, ...args });
        expect(outcome.error?.code, `${name} ${projectId}`).toBe('not_found');
      }
    }
    expect(readLog(await storedDoc(annas))).toEqual([]);
    const listed = (await s.call('list_projects')).value as { id: string }[];
    expect(listed.map((p) => p.id)).toEqual([s.id]);
  });
});

describe('projects', () => {
  it('lists projects with their counts, filtered by category', async () => {
    const s = await setup();
    const listed = (await s.call('list_projects')).value as Record<string, unknown>[];
    expect(listed).toEqual([
      expect.objectContaining({ id: s.id, category: 'adventure', status: 'draft', campaign: null, scenes: 2 }),
    ]);
    expect((await s.call('list_projects', { category: 'campaign' })).value).toEqual([]);
  });

  it('gets a project with its seed, to-do and counts', async () => {
    const s = await setup();
    const project = (await s.call('get_project', { projectId: s.id })).value;
    expect(project).toMatchObject({ id: s.id, category: 'adventure', seed: '', counts: { scenes: 2, logEntries: 0 }, lastLogEntryAt: null });
    expect(project.todo.total).toBe(project.todo.items.length);
  });

  it('gets the gdrarchive link, its own or inherited from its campaign, or null', async () => {
    const s = await setup({ category: 'campaign' });
    const created = await s.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { ...cookie(s.session), origin: ORIGIN },
      payload: { category: 'adventure', title: "L'Ancora di Sabaoth", campaignId: s.id },
    });
    const adventure = created.json().project.id as string;
    const gdrarchive = async (projectId: string) => (await s.call('get_project', { projectId })).value.gdrarchive;
    expect(await gdrarchive(s.id)).toBeNull();
    expect(await gdrarchive(adventure)).toBeNull();

    const kulthos = { url: 'https://gdrarchive.siberio.eu/campaigns/12', label: 'Kulthos' };
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setGdrarchive(doc, kulthos));
    expect(await gdrarchive(s.id)).toEqual({ ...kulthos, inherited: false });
    expect(await gdrarchive(adventure)).toEqual({ ...kulthos, inherited: true });

    const own = { url: 'https://gdrarchive.siberio.eu/campaigns/31', label: '' };
    await withLiveDocument(s.app.sync, adventure, s.user.id, (doc) => setGdrarchive(doc, own));
    expect(await gdrarchive(adventure)).toEqual({ ...own, inherited: false });

    // The campaign in the bin: nothing to inherit.
    await withLiveDocument(s.app.sync, adventure, s.user.id, (doc) => setGdrarchive(doc, null));
    const binned = await s.app.inject({
      method: 'DELETE',
      url: `/api/projects/${s.id}`,
      headers: { ...cookie(s.session), origin: ORIGIN },
    });
    expect(binned.statusCode).toBeLessThan(300);
    expect(await gdrarchive(adventure)).toBeNull();
  });

  it('creates «La fiera di Randazzo», a draft one-shot from the templates, with no seed', async () => {
    const s = await setup();
    const outcome = await s.call('create_project', { title: 'La fiera di Randazzo', category: 'one-shot' });
    expect(outcome.isError).toBe(false);
    const created = outcome.value.project;
    expect(created).toMatchObject({ title: 'La fiera di Randazzo', category: 'one-shot', status: 'draft', seed: '' });
    expect(created.todoTotal).toBeGreaterThan(0);
    const doc = await storedDoc(created.id);
    expect(readDocument(doc)).toContain('La fiera di Randazzo');
    expect(readTodo(doc).length).toBe(created.todoTotal);
  });

  it('refuses a campaignId that is not one of the user’s campaigns', async () => {
    const s = await setup();
    const outcome = await s.call('create_project', { title: 'X', category: 'one-shot', campaignId: s.id });
    expect(outcome.error?.code).toBe('invalid_campaign');
  });
});

describe('reading the document', () => {
  it('outlines an adventure with the problems per target, and a campaign unchecked', async () => {
    const s = await setup();
    const outline = (await s.call('get_outline', { projectId: s.id })).value;
    expect(outline.checked).toBe(true);
    expect(outline.targets.map((t: { target: string }) => t.target)).toEqual(expect.arrayContaining(['S1', 'S2']));
    expect(outline.targets[0]).toHaveProperty('errors');
  });

  it('reads the whole document or one target, with its hash', async () => {
    const s = await setup();
    const whole = (await s.call('read_document', { projectId: s.id })).value;
    expect(whole).toEqual({ text: ADVENTURE, hash: textHash(ADVENTURE) });
    const s2 = (await s.call('read_document', { projectId: s.id, target: 's2' })).value;
    const expected = scene('S2', 'Il molo', 'Il mare è nero.', 'il porto, alba.');
    expect(s2).toEqual({ target: 'S2', kind: 'scene', title: 'Il molo', text: expected, hash: textHash(expected) });
    expect((await s.call('read_document', { projectId: s.id, target: 'orologio' })).value.text).toBe(
      '## Orologio\n\nPrima scossa a mezzanotte.',
    );
  });

  it('answers unknown_target with the valid targets', async () => {
    const s = await setup();
    const outcome = await s.call('read_document', { projectId: s.id, target: 'S9' });
    expect(outcome.error?.code).toBe('unknown_target');
    expect(outcome.error?.message).toContain('S1, ');
    expect(outcome.error?.details.targets.map((t: { target: string }) => t.target)).toContain('S2');
  });
});

describe('replace_section', () => {
  const read = async (s: Setup, target: string) =>
    (await s.call('read_document', { projectId: s.id, target })).value as { text: string; hash: string };

  it('replaces a scene, keeps a snapshot of the text before, and answers the new hash', async () => {
    const s = await setup();
    const { text, hash } = await read(s, 'S1');
    const markdown = scene('S1', 'La casa che crolla', 'La casa crolla.', 'casa Faraci, mezzanotte.');
    const outcome = await s.call('replace_section', { projectId: s.id, target: 'S1', markdown: `${markdown}\n\n\n`, hash });
    expect(outcome.isError).toBe(false);
    expect(outcome.value).toMatchObject({ target: 'S1', title: 'La casa che crolla', hash: textHash(markdown) });
    expect(outcome.value.errors).toBe(check(ADVENTURE, templates.avventura, NONE, NOW)!.errors);
    // The problems answered are the ones inside the new scene.
    expect(outcome.value.problems.length).toBeGreaterThan(0);
    for (const problem of outcome.value.problems) expect(problem.line).toBeGreaterThanOrEqual(7);
    const after = ADVENTURE.replace(text, markdown);
    expect(await storedText(s.id)).toBe(after);
    expect(await snapshots(s.id)).toEqual([
      {
        kind: 'claude',
        label: 'S1 · La casa che crolla',
        text: ADVENTURE,
        tool: 'replace_section',
        target: 'S1',
        before_section: text,
        after_hash: textHash(markdown),
      },
    ]);
    const grant = await db.queryOne<{ id: string }>('select id from oauth_grants');
    const row = await db.queryOne<{ grant_id: string; id: string }>('select grant_id, id from snapshots');
    expect(row!.grant_id).toBe(grant!.id);
    expect(outcome.value.snapshotId).toBe(row!.id);
  });

  it('refuses with changed_since_read when the target changed since it was read, and keeps the user’s text', async () => {
    const s = await setup();
    const { hash } = await read(s, 'S1');
    const typed = ADVENTURE.replace('La casa trema.', 'La casa trema forte.');
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setDocumentText(doc, typed));
    const outcome = await s.call('replace_section', {
      projectId: s.id,
      target: 'S1',
      markdown: scene('S1', 'X', 'Y', 'Z'),
      hash,
    });
    expect(outcome.error?.code).toBe('changed_since_read');
    expect(outcome.error?.message).toBe('The section changed since you read it; read it again.');
    expect(await storedText(s.id)).toBe(typed);
    expect(await snapshots(s.id)).toEqual([]);
  });

  it.each([
    ['another level', '## S1. La casa'],
    ['no heading', 'La casa che cede.'],
    ['another scene id', '### S7. La casa'],
    ['a dropped scene id', '### La casa'],
    ['a second scene inside', `${scene('S1', 'A', 'B', 'C')}\n\n### S9. Altra`],
    ['a section heading inside', `${scene('S1', 'A', 'B', 'C')}\n\n## Nuova sezione`],
  ])('refuses %s as invalid_markdown', async (_name, markdown) => {
    const s = await setup();
    const { hash } = await read(s, 'S1');
    const outcome = await s.call('replace_section', { projectId: s.id, target: 'S1', markdown, hash });
    expect(outcome.error?.code).toBe('invalid_markdown');
    expect(outcome.error?.field).toBe('markdown');
    expect(await storedText(s.id)).toBe(ADVENTURE);
    expect(await snapshots(s.id)).toEqual([]);
  });

  it('writes an edit that adds an error and reports the problems', async () => {
    const s = await setup();
    const { hash } = await read(s, 'S2');
    const markdown = ['### S2. Il molo', '', '**Luogo e momento:** il porto, alba.'].join('\n');
    const outcome = await s.call('replace_section', { projectId: s.id, target: 'S2', markdown, hash });
    expect(outcome.error).toBeUndefined();
    const before = check(ADVENTURE, templates.avventura, NONE, NOW)!;
    expect(outcome.value).toMatchObject({
      errorsBefore: before.errors,
      warningsBefore: before.warnings,
      errors: before.errors + 1,
      problems: expect.arrayContaining([expect.objectContaining({ code: 'callout.count', severity: 'error' })]),
    });
    expect(await storedText(s.id)).toContain(markdown);
    expect(await snapshots(s.id)).toHaveLength(1);
  });
});

describe('inputs built to be slow', () => {
  it('trims a long run of spaces and refuses a long heading line in linear time', async () => {
    const s = await setup();
    const { hash } = (await s.call('read_document', { projectId: s.id, target: 'S1' })).value;
    const spaces = ' '.repeat(99_000);
    const cases: [string, string][] = [
      [`x${spaces}y`, 'invalid_markdown'],
      [`### S1. ${spaces}y`, 'invalid_markdown'],
    ];
    for (const [markdown, code] of cases) {
      const started = performance.now();
      const outcome = await s.call('replace_section', { projectId: s.id, target: 'S1', markdown, hash });
      expect(performance.now() - started, code).toBeLessThan(2000);
      expect(outcome.error?.code).toBe(code);
    }
    const long = await s.call('replace_section', { projectId: s.id, target: 'S1', markdown: `### S1. ${'a'.repeat(HEADING_LINE_MAX)}`, hash });
    expect(long.error?.code).toBe('invalid_markdown');
    expect(long.error?.message).toContain(`${HEADING_LINE_MAX} characters`);
    expect(await storedText(s.id)).toBe(ADVENTURE);
    // Written, with the trailing blanks trimmed; the edit changes the hash.
    for (const tail of [spaces, '\n '.repeat(45_000)]) {
      const current = (await s.call('read_document', { projectId: s.id, target: 'S1' })).value;
      const started = performance.now();
      const outcome = await s.call('replace_section', {
        projectId: s.id,
        target: 'S1',
        markdown: `### S1. A\n\nTesto.${tail}`,
        hash: current.hash,
      });
      expect(performance.now() - started).toBeLessThan(2000);
      expect(outcome.error).toBeUndefined();
    }
    const started = performance.now();
    const added = await s.call('add_scene', { projectId: s.id, title: 'X', markdown: `\n${' '.repeat(50_000)}\n${spaces}` });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(added.error).toBeUndefined();
  });
});

describe('limits on writes', () => {
  it('lets a grant make 120 writes per 10 minutes, then answers rate_limited with retry_after', async () => {
    const s = await setup();
    for (let i = 0; i < 120; i++) {
      const outcome = await s.call('add_research_topic', { projectId: s.id, names: [`Tema ${i}`] });
      expect(outcome.isError, `write ${i}`).toBe(false);
    }
    const refused = await s.call('add_todo', { projectId: s.id, items: ['Una in più'] });
    expect(refused.error).toMatchObject({ code: 'rate_limited' });
    expect(refused.error!.retry_after).toBeGreaterThan(0);
    expect(refused.error!.retry_after).toBeLessThanOrEqual(600);
    expect(readTodo(await storedDoc(s.id)).some((t) => t.text === 'Una in più')).toBe(false);
    // Reads go on.
    expect((await s.call('list_todo', { projectId: s.id })).isError).toBe(false);
  });

  it('counts each grant on its own and frees writes as the window slides', () => {
    let now = 0;
    const quota = new WriteQuota(3, 1000, () => now);
    expect([quota.take('a'), quota.take('a'), quota.take('a')]).toEqual([null, null, null]);
    expect(quota.take('a')).toBe(1);
    expect(quota.take('b')).toBeNull();
    now = 1001;
    expect(quota.take('a')).toBeNull();
  });

  it('keeps at most 200 Claude snapshots per project, removing the oldest', async () => {
    const s = await setup();
    await db.query(
      `insert into snapshots (project_id, kind, label, text, words, created_at)
       select $1, 'claude', 'old ' || n, 'x', 1, now() - make_interval(mins => 1000 - n)
       from generate_series(1, $2) as n`,
      [s.id, CLAUDE_SNAPSHOTS_MAX],
    );
    await db.query(`insert into snapshots (project_id, kind, label, text, words) values ($1, 'user', 'mine', 'x', 1)`, [s.id]);
    const { hash } = (await s.call('read_document', { projectId: s.id, target: 'S1' })).value;
    const outcome = await s.call('replace_section', {
      projectId: s.id,
      target: 'S1',
      markdown: scene('S1', 'La casa che crolla', 'La casa crolla.', 'casa Faraci, mezzanotte.'),
      hash,
    });
    expect(outcome.isError).toBe(false);
    const claude = await db.query<{ label: string }>(
      `select label from snapshots where project_id = $1 and kind = 'claude' order by created_at`,
      [s.id],
    );
    expect(claude).toHaveLength(CLAUDE_SNAPSHOTS_MAX);
    expect(claude[0]!.label).toBe('old 2');
    expect(claude.at(-1)!.label).toBe('S1 · La casa che crolla');
    expect(await db.query(`select id from snapshots where kind = 'user'`)).toHaveLength(1);
  });
});

describe('add_scene', () => {
  it('says in its description what a scene needs, from the template', async () => {
    const s = await setup();
    const description = (await mcpListTools(s.app, s.tokens.access_token)).find((t) => t.name === 'add_scene')!.description!;
    for (const part of ['[!leggi]', '**Luogo e momento:**', '**In gioco:**', '**Da non perdere qui**', '**Cosa succede da sé**', '**Se deragliano:**', '«Se i PG»']) {
      expect(description).toContain(part);
    }
    expect(description).toContain('Recommended (a warning when missing): **Indizi qui**');
  });

  it('adds the next scene at the end of «Scene», and its undo removes it', async () => {
    const s = await setup();
    const body = FULL_BODY;
    const outcome = await s.call('add_scene', { projectId: s.id, title: 'La fiera', markdown: `\n${body}\n\n` });
    expect(outcome.isError).toBe(false);
    const added = `### S3. La fiera\n\n${body}`;
    expect(outcome.value).toMatchObject({ target: 'S3', title: 'La fiera', hash: textHash(added) });
    const text = await storedText(s.id);
    expect(text).toBe(ADVENTURE.replace("il porto, alba.\n\n## Indizi", `il porto, alba.\n\n${added}\n\n## Indizi`));
    const found = findTarget(text, templates.avventura, 'S3');
    expect(found.ok && textHash(text.slice(found.target.from, found.target.to))).toBe(textHash(added));
    expect(await snapshots(s.id)).toEqual([
      expect.objectContaining({ kind: 'claude', tool: 'add_scene', target: 'S3', before_section: '', label: 'S3 · La fiera' }),
    ]);
    const undo = await s.app.inject({
      method: 'POST',
      url: `/api/projects/${s.id}/snapshots/${outcome.value.snapshotId}/undo`,
      headers: { ...cookie(s.session), origin: ORIGIN },
    });
    expect(undo.statusCode).toBe(200);
    expect(await storedText(s.id)).toBe(ADVENTURE);
  });

  it('starts at S1 in a «Scene» section with no scene', async () => {
    const s = await setup({ text: '## Orologio\n\nNiente.\n\n## Scene\n\n## Indizi\n\nNulla.\n' });
    const body = FULL_BODY;
    const outcome = await s.call('add_scene', { projectId: s.id, title: 'Prima', markdown: body });
    expect(outcome.value?.target).toBe('S1');
    expect(await storedText(s.id)).toContain(`## Scene\n\n### S1. Prima\n\n${body}\n\n## Indizi`);
  });

  it('writes a body that adds errors, and refuses a heading inside', async () => {
    const s = await setup();
    const empty = await s.call('add_scene', { projectId: s.id, title: 'Vuota', markdown: '' });
    expect(empty.error).toBeUndefined();
    expect(empty.value?.problems.map((p: { code: string }) => p.code)).toContain('callout.count');
    const written = await storedText(s.id);
    expect(written).toContain('### S3. Vuota');
    const heading = await s.call('add_scene', { projectId: s.id, title: 'X', markdown: '> [!leggi]\n> a\n\n### S8. Y' });
    expect(heading.error?.code).toBe('invalid_markdown');
    expect((await s.call('add_scene', { projectId: s.id, title: 'Due\nrighe', markdown: '' })).isError).toBe(true);
    expect(await storedText(s.id)).toBe(written);
  });

  it('refuses a campaign', async () => {
    const s = await setup({ category: 'campaign' });
    expect((await s.call('add_scene', { projectId: s.id, title: 'X', markdown: '' })).error?.code).toBe('not_an_adventure');
    expect(await storedText(s.id)).toBe(CAMPAIGN);
  });
});

describe('to-do, inspiration, research and the brainstorm log', () => {
  it('adds to-do items at the end and lists them with the progress', async () => {
    const s = await setup();
    const before = (await s.call('list_todo', { projectId: s.id })).value;
    const outcome = await s.call('add_todo', { projectId: s.id, items: ['Mappa del porto', 'PNG del molo'] });
    expect(outcome.value.added.map((a: { text: string }) => a.text)).toEqual(['Mappa del porto', 'PNG del molo']);
    const after = (await s.call('list_todo', { projectId: s.id })).value;
    expect(after.total).toBe(before.total + 2);
    expect(after.items.slice(-2)).toEqual([
      { text: 'Mappa del porto', done: false, note: '', due: null },
      { text: 'PNG del molo', done: false, note: '', due: null },
    ]);
    expect((await s.call('add_todo', { projectId: s.id, items: Array(21).fill('x') })).isError).toBe(true);
    expect((await s.call('add_todo', { projectId: s.id, items: ['x'.repeat(2001)] })).isError).toBe(true);
  });

  it('adds inspiration items by Claude and reads the seed with its versions', async () => {
    const s = await setup();
    const link = await s.call('add_inspiration_item', {
      projectId: s.id,
      kind: 'link',
      text: 'Il terremoto di Messina',
      url: 'https://it.wikipedia.org/wiki/Terremoto_di_Messina_del_1908',
      why: 'La scossa del primo atto.',
    });
    expect(link.value.item).toMatchObject({ kind: 'link', by: 'claude' });
    expect((await s.call('add_inspiration_item', { projectId: s.id, kind: 'link', text: 'x', why: '' })).error?.code).toBe(
      'invalid_input',
    );
    expect(
      (await s.call('add_inspiration_item', { projectId: s.id, kind: 'link', text: 'x', url: 'javascript:alert(1)', why: '' }))
        .isError,
    ).toBe(true);
    expect(
      (await s.call('add_inspiration_item', { projectId: s.id, kind: 'quote', text: 'x', url: 'https://a.example', why: '' }))
        .error?.code,
    ).toBe('invalid_input');
    const read = (await s.call('get_inspiration', { projectId: s.id })).value;
    expect(read.items).toHaveLength(1);
    expect(Array.isArray(read.seed)).toBe(true);
  });

  it('saves a research note, updates it by topic, and notes the topic', async () => {
    const s = await setup();
    const topics = await s.call('add_research_topic', { projectId: s.id, names: ['Porti siciliani', 'porti  SICILIANI', 'Navi'] });
    expect(topics.value.added.map((t: { name: string }) => t.name)).toEqual(['Porti siciliani', 'Navi']);
    expect(topics.value.skipped).toEqual(['porti  SICILIANI']);
    const source = { title: 'Treccani', url: 'https://www.treccani.it/', accessed: '2026-10-19' };
    const first = await s.call('save_research_note', { projectId: s.id, topic: 'Porti siciliani', summary: 'Prima.', facts: ['a'], sources: [source] });
    expect(first.value.created).toBe(true);
    const second = await s.call('save_research_note', { projectId: s.id, topic: 'porti siciliani', summary: 'Seconda.', facts: [], sources: [] });
    expect(second.value).toMatchObject({ created: false, note: { id: first.value.note.id, summary: 'Seconda.', by: 'claude' } });
    const doc = await storedDoc(s.id);
    expect(readNotes(doc)).toHaveLength(1);
    expect(readTopics(doc).find((t) => t.name === 'Porti siciliani')?.state).toBe('noted');
    const listed = (await s.call('list_research', { projectId: s.id })).value;
    expect(listed.notes).toEqual([expect.objectContaining({ topic: 'Porti siciliani', sources: 0 })]);
    expect((await s.call('get_research_note', { projectId: s.id, topic: 'PORTI siciliani' })).value.note.summary).toBe('Seconda.');
    expect((await s.call('get_research_note', { projectId: s.id, noteId: first.value.note.id })).isError).toBe(false);
    expect((await s.call('get_research_note', { projectId: s.id })).error?.code).toBe('invalid_input');
    const badDate = await s.call('save_research_note', {
      projectId: s.id,
      topic: 'Navi',
      summary: '',
      facts: [],
      sources: [{ ...source, accessed: '19/10/2026' }],
    });
    expect(badDate.isError).toBe(true);
  });

  it('writes a brainstorm entry first in the log, by Claude, dated now', async () => {
    const s = await setup();
    const started = Date.now();
    const outcome = await s.call('add_brainstorm_entry', {
      projectId: s.id,
      title: 'La scossa',
      ideas: ['Il faro si spegne', 'Neri mente'],
      decisions: [],
      rejected: [{ idea: 'Uno tsunami', why: 'Troppo grande per una sera.' }],
      questions: ['Chi ha il quaderno?'],
    });
    expect(outcome.value.entry).toMatchObject({ title: 'La scossa', by: 'claude', todoAdded: false });
    expect(Date.parse(outcome.value.entry.at)).toBeGreaterThanOrEqual(started - 1000);
    const log = (await s.call('get_brainstorm_log', { projectId: s.id })).value;
    expect(log.entries[0]).toMatchObject({ id: outcome.value.entry.id, ideas: ['Il faro si spegne', 'Neri mente'] });
    expect(readLog(await storedDoc(s.id))[0]!.id).toBe(outcome.value.entry.id);
    expect((await s.call('get_brainstorm_log', { projectId: s.id, limit: 51 })).isError).toBe(true);
  });

  it('answers a cap reached as invalid_input, not as an internal error', async () => {
    const s = await setup();
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      const array = doc.getArray<Y.Map<unknown>>('researchTopics');
      for (let i = 0; i < 200; i++) {
        const item = new Y.Map<unknown>();
        item.set('id', `t${i}`);
        item.set('name', `Tema ${i}`);
        item.set('state', 'open');
        item.set('at', new Date().toISOString());
        array.push([item]);
      }
    });
    const outcome = await s.call('add_research_topic', { projectId: s.id, names: ['Uno in più'] });
    expect(outcome.error?.code).toBe('invalid_input');
    expect(outcome.error?.message).toContain('at most 200');
  });
});

describe('a token used by the token endpoint as the MCP endpoint sees it', () => {
  it('refreshes and keeps working with the new access token', async () => {
    const s = await setup();
    const refreshed = await s.app.inject({
      method: 'POST',
      url: '/api/oauth/token',
      headers: FORM,
      payload: form({ grant_type: 'refresh_token', refresh_token: s.tokens.refresh_token, client_id: s.tokens.clientId }),
    });
    const next = refreshed.json().access_token as string;
    expect((await mcpCallTool(s.app, next, 'list_projects')).isError).toBe(false);
  });
});

describe('hidden problems', () => {
  const problemsOf = (text: string) => parseAdventure(text, { template: templates.avventura }).problems;
  const hide = (s: Setup, text: string, problem: Problem, how: 'dismissed' | 'snoozed') =>
    withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      const now = new Date();
      hideProblem(doc, problem, text, how, how === 'snoozed' ? new Date(now.getTime() + SNOOZE_MS.week).toISOString() : null, now);
    });
  // A problem no other problem shares a hide key with, so a hide takes away
  // exactly one.
  const lone = (problems: Problem[], text: string, severity: Problem['severity'], inside = (_: Problem) => true) =>
    problems.find((p) => p.severity === severity && inside(p));

  it('marks hidden problems in an edit result and leaves them out of its counts', async () => {
    const s = await setup();
    const { hash } = (await s.call('read_document', { projectId: s.id, target: 'S2' })).value;
    const markdown = ['### S2. Il molo', '', '**Luogo e momento:** il porto, alba.'].join('\n');
    const target = findTarget(ADVENTURE, templates.avventura, 'S2');
    if (!target.ok) throw new Error('no S2');
    const next = ADVENTURE.slice(0, target.target.from) + markdown + ADVENTURE.slice(target.target.to);
    const end = target.target.from + markdown.length;
    const inScene = (p: Problem) => p.range.start.offset >= target.target.from && p.range.start.offset <= end;
    const all = problemsOf(next);
    const error = lone(all, next, 'error', inScene)!;
    const warning = lone(all, next, 'warning', inScene)!;
    expect(error && warning).toBeTruthy();
    await hide(s, next, error, 'dismissed');
    await hide(s, next, warning, 'snoozed');

    const outcome = await s.call('replace_section', { projectId: s.id, target: 'S2', markdown, hash });
    expect(outcome.error).toBeUndefined();
    const listed = outcome.value.problems as Array<{ code: string; hidden?: string; until?: string; severity: string }>;
    const dismissed = listed.filter((p) => p.hidden === 'dismissed');
    const snoozed = listed.filter((p) => p.hidden === 'snoozed');
    expect(dismissed.length).toBeGreaterThanOrEqual(1);
    expect(snoozed.length).toBeGreaterThanOrEqual(1);
    for (const p of dismissed) expect(p).not.toHaveProperty('until');
    for (const p of snoozed) expect(p.until).toMatch(/^\d{4}-\d\d-\d\dT/);
    for (const p of listed.filter((p) => !p.hidden)) expect(p).not.toHaveProperty('until');
    const shown = (severity: string) => listed.filter((p) => !p.hidden && p.severity === severity).length;
    const total = (severity: string) => all.filter((p) => p.severity === severity).length;
    // The counts are the whole document's, shown problems only.
    const hiddenIn = (severity: string) => listed.filter((p) => p.hidden && p.severity === severity).length;
    expect(outcome.value.errors).toBe(total('error') - hiddenIn('error'));
    expect(outcome.value.warnings).toBe(total('warning') - hiddenIn('warning'));
    expect(shown('error')).toBeLessThanOrEqual(outcome.value.errors);
  });

  it('leaves them out of get_outline, per target and in total, and of the stored counts', async () => {
    const s = await setup();
    const problems = problemsOf(ADVENTURE);
    const inScene = (p: Problem) => p.sceneId !== undefined;
    const error = lone(problems, ADVENTURE, 'error', inScene)!;
    const warning = lone(problems, ADVENTURE, 'warning', inScene)!;
    const before = (await s.call('get_outline', { projectId: s.id })).value;
    const listedBefore = ((await s.call('list_projects')).value as Array<{ id: string; errors: number; warnings: number }>).find((p) => p.id === s.id)!;
    await hide(s, ADVENTURE, error, 'dismissed');
    await hide(s, ADVENTURE, warning, 'snoozed');
    const hidden = (hidden: Problem[]) => hidden.length;
    const same = (a: Problem, b: Problem) => problemKey(a, ADVENTURE) === problemKey(b, ADVENTURE);
    const gone = problems.filter((p) => same(p, error) || same(p, warning));
    const key = (severity: string) => gone.filter((p) => p.severity === severity).length;
    expect(hidden(gone)).toBeGreaterThanOrEqual(2);

    const after = (await s.call('get_outline', { projectId: s.id })).value;
    expect(after.errors).toBe(before.errors - key('error'));
    expect(after.warnings).toBe(before.warnings - key('warning'));
    const sum = (o: typeof after, k: 'errors' | 'warnings') =>
      o.targets
        .filter((t: { kind: string }) => t.kind === 'scene')
        .reduce((n: number, t: { errors: number; warnings: number }) => n + t[k], 0);
    expect(sum(before, 'errors') - sum(after, 'errors')).toBe(key('error'));
    expect(sum(before, 'warnings') - sum(after, 'warnings')).toBe(key('warning'));

    // The stored row, which list_projects and get_project read.
    const listed = ((await s.call('list_projects')).value as Array<{ id: string; errors: number; warnings: number }>).find((p) => p.id === s.id)!;
    expect(listed.errors).toBe(listedBefore.errors - key('error'));
    expect(listed.warnings).toBe(listedBefore.warnings - key('warning'));
    const one = (await s.call('get_project', { projectId: s.id })).value;
    expect(one.counts.errors).toBe(listed.errors);
    expect(one.counts.warnings).toBe(listed.warnings);
  });

  it('says in the descriptions that counts leave hidden problems out', async () => {
    const s = await setup();
    const tools = await mcpListTools(s.app, s.tokens.access_token);
    for (const name of ['get_outline', 'replace_section', 'add_scene']) {
      expect(tools.find((t) => t.name === name)!.description, name).toContain('Counts leave out problems the user hid');
    }
  });
});
