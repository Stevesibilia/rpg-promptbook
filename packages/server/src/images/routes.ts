import type { FastifyInstance, FastifyRequest } from 'fastify';
import { IMAGE_SHAPES, imageModelKeys, type ImageModelKey, type ImageProvider } from 'promptbook-project';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Config } from '../config.js';
import type { Db, Queryable } from '../db.js';
import { AppError } from '../errors.js';
import { getSettings } from '../routes/settings.js';
import { parseBody } from '../validation.js';
import { AtelierError, describeToken, readEstimates, readMonth } from './atelier.js';
import { ATELIER_JOB_ERRORS } from './jobs.js';
import { checkKey, IMAGE_ERRORS } from './openrouter.js';
import { markSecretChecked, readSecret, removeSecret, saveSecret } from './secrets.js';
import { atelierUnavailable, ownProject, serverKeyOf, startImageGeneration, type ImageStarter } from './start.js';

// Image generation's routes (board-image-generation design decisions 2, 7
// and 11; atelier-image-provider design decisions 8, 9 and 12). Every one
// needs a session or the desktop's token. The plain OpenRouter key and
// Atelier token are read from the request or the database and handed to
// their clients only; they are in no answer, error or log line.

export type StatusError = 'key_unreadable' | 'key_rejected' | 'openrouter_unreachable';

export interface Spending {
  month: { images: number; cost: number };
  all: { images: number; cost: number };
  // This calendar month (UTC), one entry per project with at least one row
  // this month, by title; projectId and title null for projects removed for
  // good. `atelier` and `openrouter` split its cost by provider.
  projects: {
    projectId: string | null;
    title: string | null;
    images: number;
    cost: number;
    atelier: number;
    openrouter: number;
  }[];
}

export type AtelierStatusError = 'token_unreadable' | 'token_rejected' | 'token_read_only' | 'atelier_unreachable';

export interface AtelierTokenStatus {
  hint: string;
  checkedAt: string;
  // Filled only by ?check=1 or a save:
  name: string | null;
  expiresAt: string | null;
  month: { spent: number; cap: number } | null;
  estimates: Partial<Record<ImageModelKey, number>> | null;
}

export interface ImageGenerationStatus {
  configured: boolean;
  key: { hint: string; checkedAt: string; limitRemaining: number | null } | null;
  // Why the key is missing or not working, when that is known.
  error?: StatusError;
  spending: Spending;
  // The account's choice (D5).
  provider: ImageProvider;
  atelier: {
    // ATELIER_URL is set.
    available: boolean;
    url: string | null;
    token: AtelierTokenStatus | null;
    // Why the token is missing or not working, when that is known.
    error?: AtelierStatusError;
  };
}

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
  const projects = await db.query<{
    project_id: string | null;
    title: string | null;
    images: number;
    cost: string;
    atelier: string;
    openrouter: string;
  }>(
    `select g.project_id, p.title, count(*) filter (where g.ok)::int as images,
            coalesce(sum(g.cost), 0) as cost,
            coalesce(sum(g.cost) filter (where g.provider = 'atelier'), 0) as atelier,
            coalesce(sum(g.cost) filter (where g.provider = 'openrouter'), 0) as openrouter
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
      atelier: dollars(p.atelier),
      openrouter: dollars(p.openrouter),
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

// The start of a prompt's file names, the running jobs' handles and the
// start itself live in start.ts (connector-board-images design decision 2).
export { labelOf, notConfigured, type GenerationHandle } from './start.js';

const keySchema = z.object({ key: z.string().trim().min(1, 'is required').max(200, 'at most 200 characters') }).strict();

const NOT_AN_ATELIER_TOKEN = 'This is not an Atelier API token.';

const tokenSchema = z
  .object({ token: z.string().trim().min(1).max(200).startsWith('atl_pat_') })
  .strict();

const wantsCheck = (req: FastifyRequest) => (req.query as { check?: unknown } | undefined)?.check === '1';

export interface ImageRoutesOptions {
  config: Config;
  db: Db;
  // What a generation's start closes over, shared with the connector
  // (app.ts); its `runs` are the jobs running in this process.
  starter: ImageStarter;
}

export async function imageRoutes(app: FastifyInstance, { config, db, starter }: ImageRoutesOptions) {
  const { runs } = starter;
  const serverKey = (): Buffer => serverKeyOf(config);

  // The details of a write token Atelier described (D8): the month and the
  // estimates are asked too; a failure there leaves them null.
  async function atelierDetails(
    token: string,
    described: { name: string; expiresAt: string | null },
  ): Promise<Pick<AtelierTokenStatus, 'name' | 'expiresAt' | 'month' | 'estimates'>> {
    const base = config.atelierUrl!;
    const [month, estimates] = await Promise.all([readMonth(base, token), readEstimates(base, token)]);
    return { name: described.name, expiresAt: described.expiresAt, month, estimates };
  }

  // The saved Atelier token's status; Atelier is asked only with ?check=1,
  // steps 1 to 3 of D1. One failure sets the error and leaves the checked
  // details null.
  async function atelierStatus(userId: string, check: boolean): Promise<ImageGenerationStatus['atelier']> {
    const available = config.atelierUrl !== null;
    const base = { available, url: config.atelierUrl };
    if (!config.secretsKey) return { ...base, token: null };
    const stored = await readSecret(db, config.secretsKey, userId, 'atelier');
    if (stored.state === 'none') return { ...base, token: null };
    if (stored.state === 'unreadable') return { ...base, token: null, error: 'token_unreadable' };
    const token: AtelierTokenStatus = {
      hint: stored.hint,
      checkedAt: stored.checkedAt,
      name: null,
      expiresAt: null,
      month: null,
      estimates: null,
    };
    if (!check || config.atelierUrl === null) return { ...base, token };
    try {
      const described = await describeToken(config.atelierUrl, stored.key);
      if (described.access !== 'write') return { ...base, token, error: 'token_read_only' };
      Object.assign(token, await atelierDetails(stored.key, described));
    } catch (error) {
      Object.assign(token, { name: null, expiresAt: null, month: null, estimates: null });
      const rejected = error instanceof AtelierError && error.status === 401;
      return { ...base, token, error: rejected ? 'token_rejected' : 'atelier_unreachable' };
    }
    token.checkedAt = (await markSecretChecked(db, userId, 'atelier')) ?? token.checkedAt;
    return { ...base, token };
  }

  // The saved key's status; OpenRouter is asked only with ?check=1. With
  // ?check=1 the Atelier token is checked too (D8).
  async function status(userId: string, check: boolean): Promise<ImageGenerationStatus> {
    const spending = await spendingOf(db, userId);
    const { provider } = (await getSettings(db, userId)).imageGeneration;
    const [openRouter, atelier] = await Promise.all([openRouterStatus(userId, check), atelierStatus(userId, check)]);
    return { ...openRouter, spending, provider, atelier };
  }

  async function openRouterStatus(userId: string, check: boolean): Promise<Pick<ImageGenerationStatus, 'configured' | 'key' | 'error'>> {
    if (!config.secretsKey) return { configured: false, key: null };
    const stored = await readSecret(db, config.secretsKey, userId, 'openrouter');
    if (stored.state === 'none') return { configured: true, key: null };
    if (stored.state === 'unreadable') return { configured: true, key: null, error: 'key_unreadable' };
    const key = { hint: stored.hint, checkedAt: stored.checkedAt, limitRemaining: null as number | null };
    if (!check) return { configured: true, key };
    const checked = await checkKey(config.openRouterBaseUrl, stored.key);
    if (!checked.ok) return { configured: true, key, error: checked.reason };
    key.checkedAt = (await markSecretChecked(db, userId, 'openrouter')) ?? key.checkedAt;
    key.limitRemaining = checked.limitRemaining;
    return { configured: true, key };
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
    for (const run of runs.values()) {
      if (run.userId === user.id && run.provider === 'openrouter') run.stop(IMAGE_ERRORS.keyRemoved);
    }
    return reply.code(204).send();
  });

  // D8: checked with Atelier before it is stored; a token Atelier rejects, a
  // read-only one, or a check that gets no answer stores nothing and keeps
  // the old token.
  app.put('/api/image-generation/atelier-token', async (req) => {
    const { user } = requireSession(req);
    const sealing = serverKey();
    if (config.atelierUrl === null) throw atelierUnavailable();
    const parsed = tokenSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'invalid', NOT_AN_ATELIER_TOKEN);
    const { token } = parsed.data;
    let described: Awaited<ReturnType<typeof describeToken>>;
    try {
      described = await describeToken(config.atelierUrl, token);
    } catch (error) {
      if (error instanceof AtelierError && error.status === 401) {
        throw new AppError(400, 'token_rejected', 'Atelier rejected this token.');
      }
      throw new AppError(502, 'atelier_unreachable', 'Atelier did not answer. Nothing was saved.');
    }
    if (described.access !== 'write') {
      throw new AppError(400, 'token_read_only', 'This token is read only. Make one with Generate + read in Atelier.');
    }
    await saveSecret(db, sealing, user.id, 'atelier', token);
    const saved = await status(user.id, false);
    if (saved.atelier.token) {
      const details = await atelierDetails(token, described).catch(() => ({
        name: described.name,
        expiresAt: described.expiresAt,
        month: null,
        estimates: null,
      }));
      Object.assign(saved.atelier.token, details);
    }
    return saved;
  });

  app.delete('/api/image-generation/atelier-token', async (req, reply) => {
    const { user } = requireSession(req);
    const sealing = serverKey();
    await removeSecret(db, user.id, 'atelier');
    // The token is gone: the user's running Atelier jobs stop.
    for (const run of runs.values()) {
      if (run.userId === user.id && run.provider === 'atelier') run.stop(ATELIER_JOB_ERRORS.tokenRemoved);
    }
    // D5: Generate goes through OpenRouter again when its key works here.
    const settings = await getSettings(db, user.id);
    if (settings.imageGeneration.provider === 'atelier' && (await readSecret(db, sealing, user.id, 'openrouter')).state === 'ok') {
      await db.query(
        `update user_settings set settings = jsonb_set(settings, '{imageGeneration,provider}', '"openrouter"'), updated_at = now()
         where user_id = $1 and settings ? 'imageGeneration'`,
        [user.id],
      );
    }
    return reply.code(204).send();
  });

  // D7: the checks in order, the job started on the live document, the
  // answer sent at once; the job runs on in this process. The checks and the
  // start are shared with the connector (start.ts).
  app.post('/api/projects/:id/image-prompts/:promptId/generate', async (req, reply) => {
    const { user } = requireSession(req);
    const { id, promptId } = req.params as { id: string; promptId: string };
    const body = parseBody(generateSchema, req.body);
    const { jobId } = await startImageGeneration(starter, {
      userId: user.id,
      projectId: id,
      promptId,
      model: body.model,
      count: body.count,
      shape: body.shape,
      addedBy: 'user',
    });
    return reply.code(202).send({ jobId });
  });

  // D11: the images generated in this project and what OpenRouter billed for
  // them, all time.
  app.get('/api/projects/:id/image-spending', async (req) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    await ownProject(db, user.id, id);
    const row = await db.queryOne<{ images: number; cost: string }>(
      `select count(*) filter (where ok)::int as images, coalesce(sum(cost), 0) as cost
       from image_generations where project_id = $1 and user_id = $2`,
      [id, user.id],
    );
    return { images: row?.images ?? 0, cost: dollars(row?.cost ?? 0) };
  });
}

