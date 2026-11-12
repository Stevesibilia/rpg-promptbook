import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AtelierError,
  describeToken,
  downloadImage,
  ensureCollection,
  readEstimates,
  readGeneration,
  readMonth,
  startGeneration,
} from '../../src/images/atelier.js';
import { ATELIER_SENTENCES, FAKE_ATELIER_TOKENS, startFakeAtelier, type FakeAtelier } from './fake-atelier.js';

// The Atelier client (atelier-image-provider D1 and D6), against the fake
// Atelier: each step, and each kind of error.

const GOOD = FAKE_ATELIER_TOKENS.good;
const READ = FAKE_ATELIER_TOKENS.read;
const BAD = 'atl_pat_0000000000000000000000000000bad1';
const GPT = 'openai/gpt-image-2.6-sunburst';

let fake: FakeAtelier;
beforeEach(async () => {
  fake = await startFakeAtelier();
});
afterEach(() => fake.close());

// The AtelierError a call throws.
async function failure(promise: Promise<unknown>): Promise<AtelierError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AtelierError);
  return error as AtelierError;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function finished(id: string) {
  for (let i = 0; i < 200; i++) {
    const state = await readGeneration(fake.url, GOOD, id);
    if (state.status !== 'running') return state;
    await wait(10);
  }
  throw new Error('The fake generation never finished');
}

describe('the Atelier client, step by step', () => {
  it('describes a write token and a read token, and throws 401 invalid_token for another', async () => {
    expect(await describeToken(fake.url, GOOD)).toEqual({ name: 'promptbook', access: 'write', expiresAt: '2027-11-12T09:00:00.000Z' });
    expect(await describeToken(fake.url, READ)).toEqual({ name: 'gallery', access: 'read', expiresAt: null });
    const rejected = await failure(describeToken(fake.url, BAD));
    expect([rejected.status, rejected.code, rejected.message]).toEqual([401, 'invalid_token', ATELIER_SENTENCES.invalidToken]);
    expect(fake.calls.map((c) => [c.method, c.path, c.bearer])).toEqual([
      ['GET', '/api/v1/token', true],
      ['GET', '/api/v1/token', true],
      ['GET', '/api/v1/token', true],
    ]);
  });

  it('reads the month and the estimates of the two models', async () => {
    expect(await readMonth(fake.url, GOOD)).toEqual({ spent: 4.12, cap: 20 });
    expect(await readEstimates(fake.url, GOOD)).toEqual({ gpt: 0.083, nb: 0.037 });
    // A model Atelier has not enabled is left out.
    fake.answerNext(200, { models: [{ id: GPT, estCostUsd: 0.09 }, { id: 'black-forest-labs/flux', estCostUsd: 0.01 }] });
    expect(await readEstimates(fake.url, GOOD)).toEqual({ gpt: 0.09 });
  });

  it('makes a collection once, and finds it again in any letter case', async () => {
    const id = await ensureCollection(fake.url, GOOD, "L'Ancora di Sabaoth");
    expect(fake.collections.map((c) => [c.id, c.name])).toEqual([[id, "L'Ancora di Sabaoth"]]);
    expect(await ensureCollection(fake.url, GOOD, "l'ancora DI sabaoth")).toBe(id);
    expect(fake.collections).toHaveLength(1);
    expect(fake.calls.map((c) => [c.method, c.path])).toEqual([
      ['POST', '/api/v1/collections'],
      ['POST', '/api/v1/collections'],
      ['GET', '/api/v1/collections'],
    ]);
  });

  it('starts a generation into the collection, watches it and downloads its images', async () => {
    const collectionId = await ensureCollection(fake.url, GOOD, 'Prova');
    const { id } = await startGeneration(fake.url, GOOD, { prompt: 'a pier at dawn', model: GPT, aspectRatio: '3:2', count: 2, collectionId });
    expect(fake.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/api/v1/generations',
      body: { prompt: 'a pier at dawn', model: GPT, aspectRatio: '3:2', count: 2, collectionId },
      bearer: true,
    });
    const state = await finished(id);
    expect(state).toMatchObject({ status: 'done', failures: [], error: null, costUsd: 0.16 });
    expect(state.images.map((i) => [i.costUsd, i.mime])).toEqual([
      [0.08, 'image/png'],
      [0.08, 'image/png'],
    ]);
    const bytes = await downloadImage(fake.url, GOOD, state.images[0]!.id);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(fake.collections[0]!.imageIds).toEqual(state.images.map((i) => i.id));
  });

  it('reads failures and a partial generation', async () => {
    const collectionId = await ensureCollection(fake.url, GOOD, 'Prova');
    fake.failNext(1, 'The model refused this prompt.');
    const { id } = await startGeneration(fake.url, GOOD, { prompt: 'x', model: GPT, aspectRatio: '1:1', count: 2, collectionId });
    expect(await finished(id)).toMatchObject({ status: 'partial', failures: ['The model refused this prompt.'] });
  });
});

describe('the Atelier client’s errors', () => {
  it('throws Atelier’s error and sentence, with the field of an invalid_request', async () => {
    fake.capReached();
    const collectionId = await ensureCollection(fake.url, GOOD, 'Prova');
    const capped = await failure(startGeneration(fake.url, GOOD, { prompt: 'x', model: GPT, aspectRatio: '1:1', count: 1, collectionId }));
    expect([capped.status, capped.code, capped.message, capped.field]).toEqual([409, 'cap_reached', ATELIER_SENTENCES.capReached, null]);

    fake.dropCollection(collectionId);
    const gone = await failure(startGeneration(fake.url, GOOD, { prompt: 'x', model: GPT, aspectRatio: '1:1', count: 1, collectionId }));
    expect([gone.status, gone.code, gone.message, gone.field]).toEqual([400, 'invalid_request', ATELIER_SENTENCES.noCollection, 'collectionId']);

    fake.answerNext(429, { error: 'too_many_running', message: ATELIER_SENTENCES.tooManyRunning });
    const busy = await failure(readMonth(fake.url, GOOD));
    expect([busy.status, busy.code, busy.message]).toEqual([429, 'too_many_running', ATELIER_SENTENCES.tooManyRunning]);
  });

  it('throws atelier_refused for an error answer that is not Atelier’s', async () => {
    fake.answerNext(502, '<html>Bad gateway</html>');
    const refused = await failure(readMonth(fake.url, GOOD));
    expect([refused.status, refused.code, refused.message]).toEqual([502, 'atelier_refused', 'Atelier refused the request (502).']);
    fake.answerNext(500, { error: { code: 500 } });
    expect((await failure(readMonth(fake.url, GOOD))).code).toBe('atelier_refused');
  });

  it('throws atelier_bad_answer for an answer it cannot read or one past 1 MiB', async () => {
    for (const body of ['not json', { month: { spent: 'four' } }, [1, 2]]) {
      fake.answerNext(200, body);
      const bad = await failure(readMonth(fake.url, GOOD));
      expect([bad.code, bad.message]).toEqual(['atelier_bad_answer', 'Atelier sent an answer Promptbook cannot read.']);
    }
    fake.answerNext(200, { models: [], padding: 'x'.repeat(1024 * 1024) });
    expect((await failure(readEstimates(fake.url, GOOD))).code).toBe('atelier_bad_answer');
  });

  it('throws atelier_unreachable when nothing answers or the answer is too slow', async () => {
    const closed = await failure(describeToken('http://127.0.0.1:9', GOOD));
    expect([closed.status, closed.code, closed.message]).toEqual([0, 'atelier_unreachable', 'Atelier did not answer.']);

    const server = createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const silent = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      expect((await failure(readMonth(silent, GOOD, { timeoutMs: 100 }))).code).toBe('atelier_unreachable');
      expect((await failure(downloadImage(silent, GOOD, 'x', { timeoutMs: 100 }))).code).toBe('atelier_unreachable');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it('refuses a redirect, so the token never goes to another host', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(302, { location: `${fake.url}/api/v1/token` });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const redirecting = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      expect((await failure(describeToken(redirecting, GOOD))).code).toBe('atelier_unreachable');
    } finally {
      server.closeAllConnections();
      server.close();
    }
    expect(fake.calls).toEqual([]);
  });

  it('puts the token in no error it throws', async () => {
    const secret = 'atl_pat_s3cr3t_never_shown_0000000000000';
    const errors = [
      await failure(describeToken(fake.url, secret)),
      await failure(describeToken('http://127.0.0.1:9', secret)),
      await (async () => {
        fake.answerNext(500, 'boom');
        return failure(readMonth(fake.url, secret));
      })(),
    ];
    for (const error of errors) {
      expect(`${error.message} ${error.code} ${error.stack ?? ''} ${JSON.stringify(error)}`).not.toContain(secret);
    }
  });
});
