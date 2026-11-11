import { describe, expect, it } from 'vitest';
import {
  dismissGenerationError,
  finishGenerationJob,
  GenerationBusy,
  readGenerationJobs,
  recordGenerationProgress,
  STALE_GENERATION_MS,
  startGenerationJob,
  type GenerationStart,
} from '../src/index.js';
import { project, replica, sync } from './helpers.js';

const START = '2026-11-11T10:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(START) + ms);
const SOON = at(60_000);

const start = (overrides: Partial<GenerationStart> = {}): GenerationStart => ({
  id: 'job-1',
  promptId: 'p1',
  model: 'gpt',
  count: 2,
  by: 'user-1',
  startedAt: START,
  ...overrides,
});

const jobsMap = (doc: ReturnType<typeof project>) => doc.getMap<unknown>('generationJobs');

describe('generation jobs (D8)', () => {
  it('starts a job and reads it while it runs', () => {
    const doc = project();
    const job = startGenerationJob(doc, start(), SOON);
    expect(job).toEqual({ ...start(), done: 0, failed: 0, error: null, finishedAt: null });
    expect(readGenerationJobs(doc, SOON)).toEqual([job]);
    // A plain JSON value set whole under its id.
    expect(jobsMap(doc).get('job-1')).toEqual(job);
  });

  it('counts each image, added or failed, and does nothing for a job that is gone', () => {
    const doc = project();
    startGenerationJob(doc, start({ count: 4 }), SOON);
    recordGenerationProgress(doc, 'job-1', 'done', SOON);
    recordGenerationProgress(doc, 'job-1', 'done', SOON);
    recordGenerationProgress(doc, 'job-1', 'failed', SOON);
    expect(readGenerationJobs(doc, SOON)[0]).toMatchObject({ done: 2, failed: 1 });
    recordGenerationProgress(doc, 'job-2', 'done', SOON);
    expect(jobsMap(doc).has('job-2')).toBe(false);
  });

  it('deletes a job that finishes without an error', () => {
    const doc = project();
    startGenerationJob(doc, start(), SOON);
    finishGenerationJob(doc, 'job-1', null, SOON);
    expect(readGenerationJobs(doc, SOON)).toEqual([]);
    expect(jobsMap(doc).size).toBe(0);
  });

  it('keeps a job that finishes with an error until it is dismissed', () => {
    const doc = project();
    startGenerationJob(doc, start(), SOON);
    recordGenerationProgress(doc, 'job-1', 'failed', SOON);
    finishGenerationJob(doc, 'job-1', 'OpenRouter did not answer. Try again.', at(120_000));
    expect(readGenerationJobs(doc, at(120_000))).toEqual([
      {
        ...start(),
        done: 0,
        failed: 1,
        error: 'OpenRouter did not answer. Try again.',
        finishedAt: at(120_000).toISOString(),
      },
    ]);
    // A finished job with an error never goes stale.
    expect(readGenerationJobs(doc, at(STALE_GENERATION_MS * 4))).toHaveLength(1);
    // Progress after the end changes nothing.
    recordGenerationProgress(doc, 'job-1', 'done', SOON);
    expect(readGenerationJobs(doc, SOON)[0]!.done).toBe(0);
    expect(dismissGenerationError(doc, 'job-1', SOON)).toBe(true);
    expect(readGenerationJobs(doc, SOON)).toEqual([]);
    expect(dismissGenerationError(doc, 'job-1', SOON)).toBe(false);
  });

  it('dismisses no running job', () => {
    const doc = project();
    startGenerationJob(doc, start(), SOON);
    expect(dismissGenerationError(doc, 'job-1', SOON)).toBe(false);
    expect(readGenerationJobs(doc, SOON)).toHaveLength(1);
  });

  it('refuses a second start on a prompt while a job runs there, not on another prompt', () => {
    const doc = project();
    startGenerationJob(doc, start(), SOON);
    expect(() => startGenerationJob(doc, start({ id: 'job-2' }), SOON)).toThrow(GenerationBusy);
    startGenerationJob(doc, start({ id: 'job-3', promptId: 'p2' }), SOON);
    expect(readGenerationJobs(doc, SOON).map((j) => j.id)).toEqual(['job-1', 'job-3']);
  });

  it('clears the prompt’s errored job when the next start comes', () => {
    const doc = project();
    startGenerationJob(doc, start(), SOON);
    finishGenerationJob(doc, 'job-1', 'OpenRouter is busy (rate limit). Try again in a minute.', SOON);
    startGenerationJob(doc, start({ id: 'job-2', promptId: 'p2' }), SOON);
    finishGenerationJob(doc, 'job-2', 'OpenRouter did not answer. Try again.', SOON);
    startGenerationJob(doc, start({ id: 'job-3', startedAt: SOON.toISOString() }), SOON);
    expect(readGenerationJobs(doc, SOON).map((j) => j.id)).toEqual(['job-2', 'job-3']);
    expect(jobsMap(doc).has('job-1')).toBe(false);
  });

  it('leaves out a stale job, and the next writer removes it', () => {
    const doc = project();
    startGenerationJob(doc, start(), SOON);
    startGenerationJob(doc, start({ id: 'job-2', promptId: 'p2' }), SOON);
    const late = at(STALE_GENERATION_MS + 1);
    expect(readGenerationJobs(doc, at(STALE_GENERATION_MS))).toHaveLength(2);
    expect(readGenerationJobs(doc, late)).toEqual([]);
    expect(jobsMap(doc).size).toBe(2);
    // A stale job no longer holds its prompt.
    startGenerationJob(doc, start({ id: 'job-3', startedAt: late.toISOString() }), late);
    expect(jobsMap(doc).has('job-1')).toBe(false);
    expect(jobsMap(doc).has('job-2')).toBe(false);
    expect(readGenerationJobs(doc, late).map((j) => j.id)).toEqual(['job-3']);
  });

  it('takes a start far in the future for stale, so it cannot hold its prompt', () => {
    const doc = project();
    startGenerationJob(doc, start({ startedAt: at(STALE_GENERATION_MS * 10).toISOString() }), at(STALE_GENERATION_MS * 10));
    expect(readGenerationJobs(doc, SOON)).toEqual([]);
    startGenerationJob(doc, start({ id: 'job-2', startedAt: SOON.toISOString() }), SOON);
    expect(readGenerationJobs(doc, SOON).map((j) => j.id)).toEqual(['job-2']);
  });

  it('each writer removes stale jobs first', () => {
    for (const write of [
      (doc: ReturnType<typeof project>) => recordGenerationProgress(doc, 'other', 'done', at(STALE_GENERATION_MS + 1)),
      (doc: ReturnType<typeof project>) => finishGenerationJob(doc, 'other', null, at(STALE_GENERATION_MS + 1)),
      (doc: ReturnType<typeof project>) => dismissGenerationError(doc, 'other', at(STALE_GENERATION_MS + 1)),
    ]) {
      const doc = project();
      startGenerationJob(doc, start(), SOON);
      write(doc);
      expect(jobsMap(doc).size).toBe(0);
    }
  });

  it('reads no value that is not a whole job, and leaves it alone', () => {
    const doc = project();
    const map = jobsMap(doc);
    map.set('bad-1', { id: 'bad-1', promptId: 'p1' });
    map.set('bad-2', 'nonsense');
    map.set('bad-3', { ...start({ id: 'bad-3' }), model: 'flux', done: 0, failed: 0, error: null, finishedAt: null });
    map.set('bad-4', { ...start(), done: 0, failed: 0, error: null, finishedAt: null });
    expect(readGenerationJobs(doc, SOON)).toEqual([]);
    startGenerationJob(doc, start({ id: 'job-9' }), SOON);
    expect([...map.keys()].sort()).toEqual(['bad-1', 'bad-2', 'bad-3', 'bad-4', 'job-9']);
  });

  it('refuses a start that is not one', () => {
    const doc = project();
    expect(() => startGenerationJob(doc, start({ count: 5 }))).toThrow(/count/);
    expect(() => startGenerationJob(doc, start({ count: 0 }))).toThrow(/count/);
    expect(() => startGenerationJob(doc, start({ model: 'flux' as 'gpt' }))).toThrow(/model/);
    expect(() => startGenerationJob(doc, start({ startedAt: 'yesterday' }))).toThrow(/startedAt/);
    expect(() => startGenerationJob(doc, start({ promptId: '' }))).toThrow();
  });

  it('reaches another replica through sync', () => {
    const doc = project();
    const other = replica(doc);
    startGenerationJob(doc, start(), SOON);
    recordGenerationProgress(doc, 'job-1', 'done', SOON);
    sync(doc, other);
    expect(readGenerationJobs(other, SOON)).toEqual(readGenerationJobs(doc, SOON));
  });
});
