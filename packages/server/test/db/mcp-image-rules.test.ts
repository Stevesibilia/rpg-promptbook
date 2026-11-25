import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
import { promptStyleOf } from '../../src/images/start.js';
import { FAKE_ATELIER_TOKENS, startFakeAtelier, type FakeAtelier } from './fake-atelier.js';
import { startFakeOpenRouter, type FakeOpenRouter } from './fake-openrouter.js';
import { db, ORIGIN, signedIn, startApp, steve, testConfig } from './helpers.js';
import { mcpCallTool, mcpInitialize, mcpListTools } from './mcp-helpers.js';
import { connect as connectClient } from './oauth-helpers.js';

// generator-prompt-rules: the rules Claude writes image prompts by, and the
// warnings on them, follow the account's generation setting.

let openRouter: FakeOpenRouter;
let atelier: FakeAtelier;
beforeEach(async () => {
  openRouter = await startFakeOpenRouter();
  atelier = await startFakeAtelier();
});
afterEach(async () => {
  await openRouter.close();
  await atelier.close();
});

const ADVENTURE = [
  '## Scene',
  '',
  '### S1. La casa che cede',
  '',
  '## Appendice: immagini e musica',
  '',
  '### S1. La casa che cede',
  '',
  'visual: collapsed library at night',
  '',
  'mood: chaotic',
  '',
].join('\n');

const FLAGGED = 'portrait of an old Sicilian priest with a cracked rosary --ar 2:3 --v 8.1 --no text';
const OTHER = 'portrait of an old Sicilian priest with a cracked rosary, close up --ar 2:3';

interface Setup {
  app: FastifyInstance;
  id: string;
  headers: Record<string, string>;
  userId: string;
  token: string;
  call(name: string, args?: Record<string, unknown>): ReturnType<typeof mcpCallTool>;
  listTools(): ReturnType<typeof mcpListTools>;
}

async function setup(app?: FastifyInstance): Promise<Setup> {
  const user = await steve();
  const started =
    app ?? (await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: atelier.url }, { atelierPollMs: 10 }));
  const session = await signedIn(started);
  const headers = { cookie: `pb_session=${session}`, origin: ORIGIN };
  const created = await started.inject({
    method: 'POST',
    url: '/api/projects',
    headers,
    payload: { category: 'adventure', title: 'La casa' },
  });
  const id = created.json().project.id as string;
  await withLiveDocument(started.sync, id, user.id, (doc) => setDocumentText(doc, ADVENTURE));
  const token = (await connectClient(started, session, 'read_write')).access_token;
  return {
    app: started,
    id,
    headers,
    userId: user.id,
    token,
    call: (name, args = {}) => mcpCallTool(started, token, name, args),
    listTools: () => mcpListTools(started, token),
  };
}

const chooseProvider = async (s: Setup, provider: 'openrouter' | 'atelier') => {
  const settings = (await s.app.inject({ url: '/api/settings', headers: s.headers })).json();
  const res = await s.app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers: s.headers,
    payload: { ...settings, imageGeneration: { ...settings.imageGeneration, provider } },
  });
  expect(res.statusCode).toBe(200);
};
const saveKey = async (s: Setup) =>
  expect((await s.app.inject({ method: 'PUT', url: '/api/image-generation/key', headers: s.headers, payload: { key: 'sk-or-v1-good' } })).statusCode).toBe(200);
const saveToken = async (s: Setup) =>
  expect(
    (await s.app.inject({ method: 'PUT', url: '/api/image-generation/atelier-token', headers: s.headers, payload: { token: FAKE_ATELIER_TOKENS.good } })).statusCode,
  ).toBe(200);

const styleOf = async (s: Setup) => (await s.call('get_board', { projectId: s.id })).value.imageRules;

describe('promptStyleOf', () => {
  it('is midjourney without a secrets key, a credential or a usable Atelier, generator with a key or token', async () => {
    const s = await setup();
    const config = testConfig({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: atelier.url });
    const style = (c = config) => promptStyleOf(c, db, s.userId);
    // No credential saved.
    expect(await style()).toBe('midjourney');
    await saveKey(s);
    expect(await style()).toBe('generator');
    // No secrets key on the server.
    expect(await style({ ...config, secretsKey: null })).toBe('midjourney');
    // Another secrets key: the saved key is unreadable.
    expect(await style({ ...config, secretsKey: Buffer.alloc(32, 99) })).toBe('midjourney');
    // Atelier chosen: no token yet, no Atelier address, then a token.
    await chooseProvider(s, 'atelier');
    expect(await style()).toBe('midjourney');
    await saveToken(s);
    expect(await style()).toBe('generator');
    expect(await style({ ...config, atelierUrl: null })).toBe('midjourney');
  });
});

describe('get_board imageRules', () => {
  it('follows the account: midjourney without a key, generator with one, midjourney again once it is deleted', async () => {
    const s = await setup();
    const without = await styleOf(s);
    expect(without.style).toBe('midjourney');
    expect(without.rules).toContain('--ar 16:9 --v 8.1');
    await saveKey(s);
    const withKey = await styleOf(s);
    expect(withKey.style).toBe('generator');
    expect(withKey.rules).toContain('--ar 2:3');
    // D2's text names --v only to forbid it; the Midjourney form is absent.
    expect(withKey.rules).not.toContain('--v 8.1');
    expect(withKey.rules).not.toContain('Midjourney prompts');
    const removed = await s.app.inject({ method: 'DELETE', url: '/api/image-generation/key', headers: s.headers });
    expect(removed.statusCode).toBeLessThan(300);
    expect((await styleOf(s)).style).toBe('midjourney');
  });

  it('is generator for an Atelier token and midjourney for Atelier without one', async () => {
    const s = await setup();
    await saveKey(s);
    await chooseProvider(s, 'atelier');
    expect((await styleOf(s)).style).toBe('midjourney');
    await saveToken(s);
    expect((await styleOf(s)).style).toBe('generator');
  });

  it('is midjourney on a server without a secrets key', async () => {
    const s = await setup(await startApp({ openRouterBaseUrl: openRouter.baseUrl, secretsKey: null }));
    expect((await styleOf(s)).style).toBe('midjourney');
  });
});

describe('the descriptions and the instructions', () => {
  it('point at imageRules and carry no Midjourney flags', async () => {
    const s = await setup();
    const tools = await s.listTools();
    const description = (name: string) => tools.find((t) => t.name === name)!.description!;
    for (const name of ['add_image_prompt', 'update_image_prompt', 'set_scene_prompts']) {
      expect(description(name), name).toContain('imageRules');
      expect(description(name), name).toContain('get_board');
      expect(description(name), name).not.toContain('--v');
      expect(description(name), name).not.toContain('Midjourney');
    }
    expect(description('get_board')).toContain('imageRules gives the rules for writing image prompts on this account');
    const init = await mcpInitialize(s.app, s.token);
    expect(JSON.stringify(init.message)).toContain('Write them with the rules get_board gives in imageRules');
  });
});

describe('warnings follow the style', () => {
  it('warns of shared first words for midjourney, and never of flags', async () => {
    const s = await setup();
    await s.call('add_image_prompt', { projectId: s.id, category: 'npc', name: 'Padre', prompt: OTHER });
    const second = await s.call('add_image_prompt', { projectId: s.id, category: 'pc', name: 'Altro', prompt: FLAGGED });
    expect(second.value.warnings).toHaveLength(1);
    expect(second.value.warnings[0]).toContain('starts with the same words, so Midjourney’s downloads may match both');
  });

  it('warns of flags other than --ar for generator, and never of shared first words', async () => {
    const s = await setup();
    await saveKey(s);
    await s.call('add_image_prompt', { projectId: s.id, category: 'npc', name: 'Padre', prompt: OTHER });
    const added = await s.call('add_image_prompt', { projectId: s.id, category: 'pc', name: 'Altro', prompt: FLAGGED });
    expect(added.isError).toBe(false);
    expect(added.value.warnings).toEqual(['Flags other than --ar are left out of what is sent: --v 8.1 --no text. Say it in words instead.']);
    // --ar alone: nothing to warn of.
    const clean = await s.call('add_image_prompt', { projectId: s.id, category: 'handout', name: 'Mappa', prompt: 'a harbour map, inked --ar 3:2' });
    expect(clean.value.warnings).toEqual([]);
    // update_image_prompt and set_scene_prompts too.
    const updated = await s.call('update_image_prompt', { projectId: s.id, id: added.value.prompt.id, prompt: 'portrait --v 8.1' });
    expect(updated.value.warnings).toEqual(['Flags other than --ar are left out of what is sent: --v 8.1. Say it in words instead.']);
    const scene = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: 'a library --ar 16:9 --v 8.1' } });
    expect(scene.isError).toBe(false);
    expect(scene.value.warnings).toEqual(['Flags other than --ar are left out of what is sent: --v 8.1. Say it in words instead.']);
  });

  it('writes the prompt even when it has flags (nothing is refused)', async () => {
    const s = await setup();
    await saveKey(s);
    const added = await s.call('add_image_prompt', { projectId: s.id, category: 'npc', name: 'Padre', prompt: FLAGGED });
    expect(added.value.prompt.prompt).toBe(FLAGGED);
  });

  it('still answers not_an_adventure first on a campaign', async () => {
    const s = await setup();
    await saveKey(s);
    const created = await s.app.inject({ method: 'POST', url: '/api/projects', headers: s.headers, payload: { category: 'campaign', title: 'Kulthos' } });
    const out = await s.call('set_scene_prompts', { projectId: created.json().project.id, sceneId: 'S1', image: { prompt: 'x' } });
    expect(out.error).toMatchObject({ code: 'not_an_adventure' });
  });
});
