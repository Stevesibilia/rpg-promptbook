import { createProjectDoc } from 'promptbook-project';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { Queryable } from '../../src/db.js';
import { insertProject, readUploadedState } from '../../src/projects.js';

// An uploaded document is decoded once and summarised once (desktop-app
// design decision 9): with a 5 MB state, every pass is felt by every other
// request.

const calls = vi.hoisted(() => ({ parse: 0, apply: 0 }));

vi.mock('promptbook-format', async (original) => {
  const format = await original<typeof import('promptbook-format')>();
  return {
    ...format,
    parseAdventure: (...args: Parameters<typeof format.parseAdventure>) => {
      calls.parse++;
      return format.parseAdventure(...args);
    },
  };
});

vi.mock('yjs', async (original) => {
  const yjs = await original<typeof import('yjs')>();
  return {
    ...yjs,
    applyUpdate: (...args: Parameters<typeof yjs.applyUpdate>) => {
      calls.apply++;
      return yjs.applyUpdate(...args);
    },
  };
});

// No campaigns, and every write accepted.
const tx = {
  query: async () => [],
  queryOne: async () => null,
} satisfies Queryable as Queryable;

describe('an uploaded project', () => {
  it('is decoded once and parsed once, from the check to the stored row', async () => {
    const id = '6f1c0a52-3b8e-4c1d-9a57-2d0e7f1b9c12';
    const doc = createProjectDoc({
      id,
      title: 'Una volta sola',
      category: 'one-shot',
      status: 'draft',
      campaignId: null,
      system: 'Kulthos',
      todo: [],
      document: '# Una volta sola\n',
      createdAt: '2026-10-20T07:00:00.000Z',
    });
    const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    calls.parse = 0;
    calls.apply = 0;
    await insertProject(tx, 'owner', readUploadedState(id, state), { uploaded: true });
    expect(calls).toEqual({ parse: 1, apply: 1 });
  });
});
