import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import {
  GenerationBusy,
  migrateImagePrompts,
  readGenerationJobs,
  readImagePrompts,
  sentPrompt,
  startGenerationJob,
  type Author,
  type ImageModelKey,
  type ImagePromptEntry,
  type ImageProvider,
  type ImageShape,
} from 'promptbook-project';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { BlobStore } from '../files/blobs.js';
import { hasRoom, quotaReached } from '../files/store.js';
import { openLiveDocument } from '../live.js';
import { getProject } from '../projects.js';
import { NOT_FOUND } from '../routes/projects.js';
import { getSettings } from '../routes/settings.js';
import type { Sync } from '../sync.js';
import { runGenerationJob } from './jobs.js';
import { readSecret } from './secrets.js';

// One way to start a generation (connector-board-images design decision 2):
// the board's Generate route and the connector's generate_image both call
// startImageGeneration, so the limits (one job per prompt, three per account,
// the quota) count them together. The checks and their errors are the
// route's (board-image-generation D7, atelier-image-provider D9), in the
// same order.

const GIB = 1024 ** 3;

// The room a generation asks for per image before it starts (D7).
const ROOM_PER_IMAGE = 20 * 1024 * 1024;

// At most this many jobs of one account run at once in this process (D7, 6b).
const MAX_RUNNING_JOBS = 3;

const tooManyJobs = () =>
  new AppError(429, 'too_many_jobs', 'Three generations are already running. Wait for one to finish.');

const busy = () => new AppError(409, 'busy', 'Images are already being generated for this prompt.');

export const notConfigured = () =>
  new AppError(503, 'not_configured', 'This server is not set up for image generation.');

export const atelierUnavailable = () => new AppError(503, 'atelier_unavailable', 'This server has no Atelier address.');

// A job running in this process: its end, whose account it spends for, and
// how to stop it.
export interface GenerationHandle {
  done: Promise<void>;
  userId: string;
  // The service the job goes through: removing its credential stops it.
  provider: ImageProvider;
  stop(reason: string): void;
}

// What starting a generation closes over, built once in app.ts and given to
// the image routes and the connector.
export interface ImageStarter {
  config: Config;
  db: Db;
  sync: Sync;
  blobs: BlobStore;
  // The jobs running in this process, by job id (app.ts).
  runs: Map<string, GenerationHandle>;
  // Generate requests past check 6b and not yet in `runs`, by account.
  starting: Map<string, number>;
  log: FastifyBaseLogger;
  // Only for the tests: each OpenRouter image call's timeout.
  timeoutMs?: number | undefined;
  // Only for the tests: an Atelier generation's poll interval and watch.
  atelierPollMs?: number | undefined;
  atelierWatchMs?: number | undefined;
}

export interface GenerationInput {
  userId: string;
  projectId: string;
  promptId: string;
  model: ImageModelKey;
  count: number;
  shape: ImageShape;
  // Who the images are marked as added by (connector-board-images D5).
  addedBy: Author;
}

export interface StartedGeneration {
  jobId: string;
  provider: ImageProvider;
  // When the job started, as written on the document.
  startedAt: string;
  // The run's end; it never rejects.
  done: Promise<void>;
}

// The start of a prompt's file names (D9): the scene and the prompt's number
// in it, or its name in lower-case ASCII letters, digits and hyphens.
export function labelOf(prompt: ImagePromptEntry, prompts: readonly ImagePromptEntry[]): string {
  if (prompt.category === 'scene') {
    const number = prompts.filter((p) => p.category === 'scene' && p.sceneId === prompt.sceneId).indexOf(prompt) + 1;
    return `${prompt.sceneId}-p${number}`;
  }
  const slug = (prompt.name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || prompt.category;
}

// The server's secrets key, without which nothing is generated.
export function serverKeyOf(config: Config): Buffer {
  if (!config.secretsKey) throw notConfigured();
  return config.secretsKey;
}

// The user's project, not in the bin.
export async function ownProject(db: Db, userId: string, id: string) {
  const project = await getProject(db, userId, id);
  if (!project || project.deletedAt) throw NOT_FOUND();
  return project;
}

// D7: the checks in order, the job started on the live document; the job
// runs on in this process and is not awaited.
export async function startImageGeneration(starter: ImageStarter, input: GenerationInput): Promise<StartedGeneration> {
  const { config, db, sync, blobs, runs, starting, log } = starter;
  const { userId, projectId: id, promptId } = input;
  const project = await ownProject(db, userId, id);
  // D9: the account's provider and its credential.
  const { provider } = (await getSettings(db, userId)).imageGeneration;
  const sealing = serverKeyOf(config);
  if (provider === 'atelier' && config.atelierUrl === null) throw atelierUnavailable();
  const stored = await readSecret(db, sealing, userId, provider);
  if (stored.state !== 'ok') {
    throw new AppError(
      409,
      'no_key',
      provider === 'atelier' ? 'Add your Atelier API token first.' : 'Add your OpenRouter key first.',
    );
  }
  const quotaBytes = config.filesQuotaGb * GIB;

  const jobId = randomUUID();
  let startedAt = '';
  const live = await openLiveDocument(sync, id, userId);
  let run: { prompt: string; label: string };
  let reserved = false;
  try {
    const found = await live.transact((doc) => {
      migrateImagePrompts(doc);
      const prompts = readImagePrompts(doc);
      const prompt = prompts.find((p) => p.id === promptId);
      if (!prompt) throw new AppError(404, 'prompt_not_found', 'No image prompt with that id.');
      if (sentPrompt(prompt.prompt).text === '') throw new AppError(400, 'prompt_empty', 'The prompt has no text to send.');
      return { prompt: prompt.prompt, label: labelOf(prompt, prompts) };
    });
    const running = () => readGenerationJobs(live.doc).some((j) => j.promptId === promptId && j.finishedAt === null);
    if (running()) throw busy();
    // 6b. Counted with the requests between this check and their start,
    // reserved here without an await in between.
    const own = [...runs.values()].filter((r) => r.userId === userId).length + (starting.get(userId) ?? 0);
    if (own >= MAX_RUNNING_JOBS) throw tooManyJobs();
    starting.set(userId, (starting.get(userId) ?? 0) + 1);
    reserved = true;
    if (!(await hasRoom(db, userId, input.count * ROOM_PER_IMAGE, quotaBytes))) throw quotaReached();
    // Check 6 again, in the same transaction as the start: two clicks start
    // one job.
    await live.transact((doc) => {
      startedAt = new Date().toISOString();
      try {
        startGenerationJob(doc, {
          id: jobId,
          promptId,
          model: input.model,
          provider,
          count: input.count,
          by: userId,
          startedAt,
        });
      } catch (error) {
        if (error instanceof GenerationBusy) throw busy();
        throw error;
      }
    });
    run = found;
  } finally {
    await live.close();
    if (reserved) {
      const left = (starting.get(userId) ?? 1) - 1;
      if (left > 0) starting.set(userId, left);
      else starting.delete(userId);
    }
  }

  const controller = new AbortController();
  const done = runGenerationJob(
    {
      db,
      sync,
      blobs,
      baseUrl: config.openRouterBaseUrl,
      quotaBytes,
      log,
      timeoutMs: starter.timeoutMs,
      atelierPollMs: starter.atelierPollMs,
      atelierWatchMs: starter.atelierWatchMs,
    },
    {
      jobId,
      projectId: id,
      userId,
      promptId,
      prompt: run.prompt,
      label: run.label,
      model: input.model,
      count: input.count,
      shape: input.shape,
      provider,
      key: stored.key,
      atelierUrl: config.atelierUrl,
      projectTitle: project.title,
      addedBy: input.addedBy,
      stop: controller.signal,
    },
  )
    .catch((error: unknown) => log.error({ jobId, err: error }, 'A generation job failed'))
    .finally(() => runs.delete(jobId));
  runs.set(jobId, { done, userId, provider, stop: (reason) => controller.abort(reason) });
  return { jobId, provider, startedAt, done };
}
