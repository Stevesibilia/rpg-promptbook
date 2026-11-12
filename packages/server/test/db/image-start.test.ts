import type { FastifyInstance } from 'fastify';
import { addImagePrompt } from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../../src/accounts/users.js';
import { withLiveDocument } from '../../src/live.js';
import { startFakeOpenRouter, type FakeOpenRouter } from './fake-openrouter.js';
import { db, ORIGIN, signedIn, startApp, steve } from './helpers.js';

// The generation start shared by the route and the connector
// (connector-board-images design decision 2): a refusal after the running
// jobs are counted gives its reservation back.

let fake: FakeOpenRouter;
beforeEach(async () => {
  fake = await startFakeOpenRouter();
});
afterEach(() => fake.close());

interface Setup {
  app: FastifyInstance;
  user: User;
  headers: Record<string, string>;
  id: string;
  prompts: string[];
}

async function setup(): Promise<Setup> {
  const user = await steve();
  const app = await startApp({ openRouterBaseUrl: fake.baseUrl, filesQuotaGb: 1 });
  const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
  const created = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers,
    payload: { category: 'adventure', title: 'Il molo' },
  });
  const id = created.json().project.id as string;
  const prompts = await withLiveDocument(app.sync, id, user.id, (doc) =>
    ['a', 'b', 'c', 'd', 'e'].map((n) => addImagePrompt(doc, { category: 'pc', name: `PC ${n}`, prompt: `a portrait ${n}` }, 'user').id),
  );
  const saved = await app.inject({ method: 'PUT', url: '/api/image-generation/key', headers, payload: { key: 'sk-or-v1-good' } });
  expect(saved.statusCode).toBe(200);
  return { app, user, headers, id, prompts };
}

const generate = (s: Setup, promptId: string, count = 1) =>
  s.app.inject({
    method: 'POST',
    url: `/api/projects/${s.id}/image-prompts/${promptId}/generate`,
    headers: s.headers,
    payload: { model: 'nb', count, shape: '1:1' },
  });

describe('the shared start (D2)', () => {
  it('gives back the reservation of a refused start: three run, a fourth is refused, one ends, the next starts', async () => {
    const s = await setup();
    // 30 MB left: two images (2 × 20 MB) do not fit, one does.
    await db.query(`insert into files (sha256, size, mime, created_by) values ($1, $2, 'image/png', $3)`, [
      'f'.repeat(64),
      1024 ** 3 - 30 * 1024 * 1024,
      s.user.id,
    ]);
    await db.query(`insert into project_files (project_id, sha256) values ($1, $2)`, [s.id, 'f'.repeat(64)]);
    // Refused after the running jobs were counted and the start reserved:
    // three times, more than the limit, so a leaked reservation would show.
    for (const p of s.prompts.slice(0, 3)) {
      const answer = await generate(s, p, 2);
      expect([answer.statusCode, answer.json().error]).toEqual([507, 'quota']);
    }
    fake.setDelay(1500);
    const started = await Promise.all(s.prompts.slice(0, 3).map((p) => generate(s, p)));
    expect(started.map((r) => r.statusCode)).toEqual([202, 202, 202]);
    const fourth = await generate(s, s.prompts[3]!);
    expect([fourth.statusCode, fourth.json().error]).toEqual([429, 'too_many_jobs']);
    fake.setDelay(0);
    await s.app.generationRuns.get(started[0]!.json().jobId)?.done;
    expect((await generate(s, s.prompts[4]!)).statusCode).toBe(202);
    await Promise.all([...s.app.generationRuns.values()].map((r) => r.done));
  });
});
