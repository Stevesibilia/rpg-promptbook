import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  GenerationBusy,
  IMAGE_SHAPES,
  imageModelKeys,
  migrateImagePrompts,
  readGenerationJobs,
  readImagePrompts,
  sentPrompt,
  startGenerationJob,
  type ImagePromptEntry,
} from 'promptbook-project';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Config } from '../config.js';
import type { Db, Queryable } from '../db.js';
import { AppError } from '../errors.js';
import type { BlobStore } from '../files/blobs.js';
import { hasRoom, quotaReached } from '../files/store.js';
import { openLiveDocument } from '../live.js';
import { getProject } from '../projects.js';
import { NOT_FOUND } from '../routes/projects.js';
import type { Sync } from '../sync.js';
import { parseBody } from '../validation.js';
import { runGenerationJob } from './jobs.js';
import { checkKey, IMAGE_ERRORS } from './openrouter.js';
import { markSecretChecked, readSecret, removeSecret, saveSecret } from './secrets.js';

// Image generation's routes (board-image-generation design decisions 2, 7
// and 11). Every one needs a session or the desktop's token. The plain key
// is read from the request or the database and handed to the OpenRouter
// client only; it is in no answer, error or log line.

export type StatusError = 'key_unreadable' | 'key_rejected' | 'openrouter_unreachable';

export interface Spending {
  month: { images: number; cost: number };
  all: { images: number; cost: number };
  // This calendar month (UTC), one entry per project with at least one row
  // this month, by title; projectId and title null for projects removed for
  // good.
  projects: { projectId: string | null; title: string | null; images: number; cost: number }[];
}

export interface ImageGenerationStatus {
  configured: boolean;
  key: { hint: string; checkedAt: string; limitRemaining: number | null } | null;
  // Why the key is missing or not working, when that is known.
  error?: StatusError;
  spending: Spending;
}

const GIB = 1024 ** 3;

// The room a generation asks for per image before it starts (D7).
const ROOM_PER_IMAGE = 20 * 1024 * 1024;

// Dollars as OpenRouter reports them, to the micro-dollar the table keeps.
const dollars = (value: string | number | null) => Math.round(Number(value ?? 0) * 1e6) / 1e6;

// The start of this calendar month, UTC.
const MONTH = `(date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')`;

async function spendingOf(db: Queryable, userId: string): Promise<Spending> {
  const totals = await db.queryOne<{ month_images: number; month_cost: string; all_images: number; all_cost: string }>(
    `select count(*) filter (where ok and created_at >= ${MONTH})::int as month_images,
            coalesce(sum(cost) filter (where created_at >= ${MONTH}), 0) as month_cost,
            count(*) filter (where ok)::int as all_images,
            coalesce(sum(cost), 0) as all_cost
     from image_generations where user_id = $1`,
    [userId],
  );
  const projects = await db.query<{ project_id: string | null; title: string | null; images: number; cost: string }>(
    `select g.project_id, p.title, count(*) filter (where g.ok)::int as images,
            coalesce(sum(g.cost), 0) as cost
     from image_generations g left join projects p on p.id = g.project_id
     where g.user_id = $1 and g.created_at >= ${MONTH}
     group by g.project_id, p.title
     order by p.title nulls last, g.project_id`,
    [userId],
  );
  return {
    month: { images: totals?.month_images ?? 0, cost: dollars(totals?.month_cost ?? 0) },
    all: { images: totals?.all_images ?? 0, cost: dollars(totals?.all_cost ?? 0) },
    projects: projects.map((p) => ({
      projectId: p.project_id,
      title: p.project_id === null ? null : p.title,
      images: p.images,
      cost: dollars(p.cost),
    })),
  };
}

const generateSchema = z
  .object({
    model: z.enum(imageModelKeys),
    count: z.number().int().min(1).max(4),
    shape: z.enum(IMAGE_SHAPES),
  })
  .strict();

// The start of a prompt's file names (D9): the scene and the prompt's number
// in it, or its name in lower-case ASCII letters, digits and hyphens.
function labelOf(prompt: ImagePromptEntry, prompts: readonly ImagePromptEntry[]): string {
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

// At most this many jobs of one account run at once in this process (D7, 6b).
const MAX_RUNNING_JOBS = 3;

const tooManyJobs = () =>
  new AppError(429, 'too_many_jobs', 'Three generations are already running. Wait for one to finish.');

const busy = () => new AppError(409, 'busy', 'Images are already being generated for this prompt.');

// A job running in this process: its end, whose account it spends for, and
// how to stop it.
export interface GenerationHandle {
  done: Promise<void>;
  userId: string;
  stop(reason: string): void;
}

export const notConfigured = () =>
  new AppError(503, 'not_configured', 'This server is not set up for image generation.');

const keySchema = z.object({ key: z.string().trim().min(1, 'is required').max(200, 'at most 200 characters') }).strict();

const wantsCheck = (req: FastifyRequest) => (req.query as { check?: unknown } | undefined)?.check === '1';

export interface ImageRoutesOptions {
  config: Config;
  db: Db;
  sync: Sync;
  blobs: BlobStore;
  // The jobs running in this process, by job id (app.ts).
  runs: Map<string, GenerationHandle>;
  // Only for the tests: each OpenRouter image call's timeout.
  timeoutMs?: number | undefined;
}

export async function imageRoutes(
  app: FastifyInstance,
  { config, db, sync, blobs, runs, timeoutMs }: ImageRoutesOptions,
) {
  const serverKey = (): Buffer => {
    if (!config.secretsKey) throw notConfigured();
    return config.secretsKey;
  };

  // The saved key's status; OpenRouter is asked only with ?check=1.
  async function status(userId: string, check: boolean): Promise<ImageGenerationStatus> {
    const spending = await spendingOf(db, userId);
    if (!config.secretsKey) return { configured: false, key: null, spending };
    const stored = await readSecret(db, config.secretsKey, userId, 'openrouter');
    if (stored.state === 'none') return { configured: true, key: null, spending };
    if (stored.state === 'unreadable') return { configured: true, key: null, error: 'key_unreadable', spending };
    const key = { hint: stored.hint, checkedAt: stored.checkedAt, limitRemaining: null as number | null };
    if (!check) return { configured: true, key, spending };
    const checked = await checkKey(config.openRouterBaseUrl, stored.key);
    if (!checked.ok) return { configured: true, key, error: checked.reason, spending };
    key.checkedAt = (await markSecretChecked(db, userId, 'openrouter')) ?? key.checkedAt;
    key.limitRemaining = checked.limitRemaining;
    return { configured: true, key, spending };
  }

  app.get('/api/image-generation', async (req) => {
    const { user } = requireSession(req);
    return status(user.id, wantsCheck(req));
  });

  // Checked with OpenRouter before it is stored; a key OpenRouter refuses, or
  // a check that gets no answer, stores nothing and keeps the old key.
  app.put('/api/image-generation/key', async (req) => {
    const { user } = requireSession(req);
    const sealing = serverKey();
    const { key } = parseBody(keySchema, req.body);
    const checked = await checkKey(config.openRouterBaseUrl, key);
    if (!checked.ok && checked.reason === 'key_rejected') {
      throw new AppError(400, 'key_rejected', 'OpenRouter rejected this key.');
    }
    if (!checked.ok) throw new AppError(502, 'openrouter_unreachable', 'OpenRouter did not answer. Nothing was saved.');
    await saveSecret(db, sealing, user.id, 'openrouter', key);
    const saved = await status(user.id, false);
    if (saved.key) saved.key.limitRemaining = checked.limitRemaining;
    return saved;
  });

  app.delete('/api/image-generation/key', async (req, reply) => {
    const { user } = requireSession(req);
    serverKey();
    await removeSecret(db, user.id, 'openrouter');
    // The key is gone: the user's running jobs stop asking OpenRouter.
    for (const run of runs.values()) if (run.userId === user.id) run.stop(IMAGE_ERRORS.keyRemoved);
    return reply.code(204).send();
  });

  // Generate requests past check 6b and not yet in `runs`, by account.
  const starting = new Map<string, number>();

  // The user's project, not in the bin.
  async function ownProject(userId: string, id: string) {
    const project = await getProject(db, userId, id);
    if (!project || project.deletedAt) throw NOT_FOUND();
    return project;
  }

  // D7: the checks in order, the job started on the live document, the
  // answer sent at once; the job runs on in this process.
  app.post('/api/projects/:id/image-prompts/:promptId/generate', async (req, reply) => {
    const { user } = requireSession(req);
    const { id, promptId } = req.params as { id: string; promptId: string };
    const body = parseBody(generateSchema, req.body);
    await ownProject(user.id, id);
    const sealing = serverKey();
    const stored = await readSecret(db, sealing, user.id, 'openrouter');
    if (stored.state !== 'ok') throw new AppError(409, 'no_key', 'Add your OpenRouter key first.');
    const quotaBytes = config.filesQuotaGb * GIB;

    const jobId = randomUUID();
    const live = await openLiveDocument(sync, id, user.id);
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
      const own = [...runs.values()].filter((r) => r.userId === user.id).length + (starting.get(user.id) ?? 0);
      if (own >= MAX_RUNNING_JOBS) throw tooManyJobs();
      starting.set(user.id, (starting.get(user.id) ?? 0) + 1);
      reserved = true;
      if (!(await hasRoom(db, user.id, body.count * ROOM_PER_IMAGE, quotaBytes))) throw quotaReached();
      // Check 6 again, in the same transaction as the start: two clicks start
      // one job.
      await live.transact((doc) => {
        try {
          startGenerationJob(doc, {
            id: jobId,
            promptId,
            model: body.model,
            count: body.count,
            by: user.id,
            startedAt: new Date().toISOString(),
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
        const left = (starting.get(user.id) ?? 1) - 1;
        if (left > 0) starting.set(user.id, left);
        else starting.delete(user.id);
      }
    }

    const controller = new AbortController();
    const done = runGenerationJob(
      { db, sync, blobs, baseUrl: config.openRouterBaseUrl, quotaBytes, log: app.log, timeoutMs },
      {
        jobId,
        projectId: id,
        userId: user.id,
        promptId,
        prompt: run.prompt,
        label: run.label,
        model: body.model,
        count: body.count,
        shape: body.shape,
        key: stored.key,
        stop: controller.signal,
      },
    )
      .catch((error: unknown) => app.log.error({ jobId, err: error }, 'A generation job failed'))
      .finally(() => runs.delete(jobId));
    runs.set(jobId, { done, userId: user.id, stop: (reason) => controller.abort(reason) });
    return reply.code(202).send({ jobId });
  });

  // D11: the images generated in this project and what OpenRouter billed for
  // them, all time.
  app.get('/api/projects/:id/image-spending', async (req) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    await ownProject(user.id, id);
    const row = await db.queryOne<{ images: number; cost: string }>(
      `select count(*) filter (where ok)::int as images, coalesce(sum(cost), 0) as cost
       from image_generations where project_id = $1 and user_id = $2`,
      [id, user.id],
    );
    return { images: row?.images ?? 0, cost: dollars(row?.cost ?? 0) };
  });
}

