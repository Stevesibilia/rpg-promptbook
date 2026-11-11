import type * as Y from 'yjs';
import { isImageModelKey, type ImageModelKey } from './images.js';
import { isIsoDateTime } from './model.js';
import { record } from './doc.js';

// Generation jobs (board-image-generation design decision 8): the server's
// runs of OpenRouter calls for one image prompt, in the project document so
// that every device sees the progress through the sync it already has. Each
// job is a plain JSON value set whole under its id.

export interface GenerationJob {
  id: string;
  promptId: string;
  model: ImageModelKey;
  // 1 to 4.
  count: number;
  // Images added.
  done: number;
  failed: number;
  // ISO, the server's clock.
  startedAt: string;
  // The user id that started it.
  by: string;
  // Design decision 10's plain words; null while running or when none.
  error: string | null;
  finishedAt: string | null;
}

// A job not finished this long after it started is stale: the server that
// ran it stopped. Readers leave it out and the next writer removes it.
export const STALE_GENERATION_MS = 15 * 60 * 1000;

export class GenerationBusy extends Error {
  constructor(promptId: string) {
    super(`A generation is already running on image prompt ${promptId}`);
    this.name = 'GenerationBusy';
  }
}

const jobsOf = (doc: Y.Doc) => doc.getMap<unknown>('generationJobs');

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// Nothing another client wrote is trusted: a value that is not a whole job
// reads as none.
function toJob(id: string, value: unknown): GenerationJob | null {
  const r = record(value);
  if (!r || r.id !== id) return null;
  const promptId = text(r.promptId);
  const by = text(r.by);
  const total = count(r.count);
  const done = count(r.done);
  const failed = count(r.failed);
  if (promptId === null || by === null || !isImageModelKey(r.model) || !isIsoDateTime(r.startedAt)) return null;
  if (total === null || total < 1 || done === null || failed === null) return null;
  const finishedAt = isIsoDateTime(r.finishedAt) ? r.finishedAt : null;
  return {
    id,
    promptId,
    model: r.model,
    count: total,
    done,
    failed,
    startedAt: r.startedAt,
    by,
    error: text(r.error),
    finishedAt,
  };
}

const running = (job: GenerationJob) => job.finishedAt === null;

const isStale = (job: GenerationJob, now: Date) =>
  running(job) && now.getTime() - Date.parse(job.startedAt) > STALE_GENERATION_MS;

function allJobs(doc: Y.Doc): GenerationJob[] {
  const jobs: GenerationJob[] = [];
  for (const [id, value] of jobsOf(doc).entries()) {
    const job = toJob(id, value);
    if (job) jobs.push(job);
  }
  return jobs;
}

// What every writer does first: stale jobs go. A value this reader cannot
// read (a newer server's model, say) is left alone.
function sweep(doc: Y.Doc, now: Date): void {
  const map = jobsOf(doc);
  for (const job of allJobs(doc)) if (isStale(job, now)) map.delete(job.id);
}

const byStart = (a: GenerationJob, b: GenerationJob): number => {
  const da = Date.parse(a.startedAt);
  const db = Date.parse(b.startedAt);
  if (da !== db) return da < db ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

// The running jobs and the finished ones with an error, oldest first; stale
// ones are left out.
export function readGenerationJobs(doc: Y.Doc, now: Date = new Date()): GenerationJob[] {
  return allJobs(doc)
    .filter((job) => (running(job) ? !isStale(job, now) : job.error !== null))
    .sort(byStart);
}

export interface GenerationStart {
  id: string;
  promptId: string;
  model: ImageModelKey;
  count: number;
  by: string;
  startedAt: string;
}

// Starts a job on a prompt. Throws GenerationBusy while a running job that is
// not stale holds the prompt; removes the prompt's finished jobs with an
// error, which the new one replaces.
export function startGenerationJob(doc: Y.Doc, start: GenerationStart, now: Date = new Date()): GenerationJob {
  if (!text(start.id) || !text(start.promptId) || !text(start.by)) throw new Error('A job needs an id, a prompt and a user');
  if (!isImageModelKey(start.model)) throw new Error(`model: unknown model "${String(start.model)}"`);
  if (!Number.isSafeInteger(start.count) || start.count < 1 || start.count > 4) throw new Error('count: 1 to 4');
  if (!isIsoDateTime(start.startedAt)) throw new Error('startedAt: must be an ISO date-time');
  const job: GenerationJob = { ...start, done: 0, failed: 0, error: null, finishedAt: null };
  doc.transact(() => {
    sweep(doc, now);
    const map = jobsOf(doc);
    const onPrompt = allJobs(doc).filter((j) => j.promptId === start.promptId);
    if (onPrompt.some(running)) throw new GenerationBusy(start.promptId);
    for (const old of onPrompt) map.delete(old.id);
    map.set(job.id, { ...job });
  });
  return job;
}

// Counts one image of the job, added or failed. Nothing when the job is gone.
export function recordGenerationProgress(
  doc: Y.Doc,
  jobId: string,
  outcome: 'done' | 'failed',
  now: Date = new Date(),
): void {
  doc.transact(() => {
    sweep(doc, now);
    const job = toJob(jobId, jobsOf(doc).get(jobId));
    if (!job || !running(job)) return;
    jobsOf(doc).set(jobId, { ...job, [outcome]: job[outcome] + 1 });
  });
}

// Ends the job: without an error it goes; with one it stays, finished, until
// it is dismissed or the next start on its prompt.
export function finishGenerationJob(doc: Y.Doc, jobId: string, error: string | null, now: Date = new Date()): void {
  doc.transact(() => {
    sweep(doc, now);
    const job = toJob(jobId, jobsOf(doc).get(jobId));
    if (!job) return;
    if (error === null) jobsOf(doc).delete(jobId);
    else jobsOf(doc).set(jobId, { ...job, error, finishedAt: now.toISOString() });
  });
}

// Removes a finished job, its error dismissed. False when there is no such
// finished job (a running one stays).
export function dismissGenerationError(doc: Y.Doc, jobId: string, now: Date = new Date()): boolean {
  let removed = false;
  doc.transact(() => {
    sweep(doc, now);
    const job = toJob(jobId, jobsOf(doc).get(jobId));
    if (!job || running(job)) return;
    jobsOf(doc).delete(jobId);
    removed = true;
  });
  return removed;
}
