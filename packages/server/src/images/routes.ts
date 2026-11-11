import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { BlobStore } from '../files/blobs.js';
import type { Sync } from '../sync.js';
import { parseBody } from '../validation.js';
import { checkKey } from './openrouter.js';
import { markOpenRouterKeyChecked, readOpenRouterKey, removeOpenRouterKey, saveOpenRouterKey } from './secrets.js';

// Image generation's routes (board-image-generation design decisions 2, 7
// and 11). Every one needs a session or the desktop's token. The plain key
// is read from the request or the database and handed to the OpenRouter
// client only; it is in no answer, error or log line.

export type StatusError = 'key_unreadable' | 'key_rejected' | 'openrouter_unreachable';

export interface ImageGenerationStatus {
  configured: boolean;
  key: { hint: string; checkedAt: string; limitRemaining: number | null } | null;
  // Why the key is missing or not working, when that is known.
  error?: StatusError;
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
}

export async function imageRoutes(app: FastifyInstance, { config, db }: ImageRoutesOptions) {
  const serverKey = (): Buffer => {
    if (!config.secretsKey) throw notConfigured();
    return config.secretsKey;
  };

  // The saved key's status; OpenRouter is asked only with ?check=1.
  async function status(userId: string, check: boolean): Promise<ImageGenerationStatus> {
    if (!config.secretsKey) return { configured: false, key: null };
    const stored = await readOpenRouterKey(db, config.secretsKey, userId);
    if (stored.state === 'none') return { configured: true, key: null };
    if (stored.state === 'unreadable') return { configured: true, key: null, error: 'key_unreadable' };
    const key = { hint: stored.hint, checkedAt: stored.checkedAt, limitRemaining: null as number | null };
    if (!check) return { configured: true, key };
    const checked = await checkKey(config.openRouterBaseUrl, stored.key);
    if (!checked.ok) return { configured: true, key, error: checked.reason };
    key.checkedAt = (await markOpenRouterKeyChecked(db, userId)) ?? key.checkedAt;
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
    await saveOpenRouterKey(db, sealing, user.id, key);
    const saved = await status(user.id, false);
    if (saved.key) saved.key.limitRemaining = checked.limitRemaining;
    return saved;
  });

  app.delete('/api/image-generation/key', async (req, reply) => {
    const { user } = requireSession(req);
    serverKey();
    await removeOpenRouterKey(db, user.id);
    return reply.code(204).send();
  });
}
