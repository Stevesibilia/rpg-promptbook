import type { FastifyInstance } from 'fastify';
import { categories, defaultSettings, type Settings } from 'promptbook-project';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Db, Queryable } from '../db.js';
import { parseBody } from '../validation.js';

const item = z.string().trim().min(1, 'an item needs a text').max(200);
const text = z.string().trim().max(200);
const templateId = z.string().trim().min(1).max(64);

export const settingsSchema = z
  .object({
    todoTemplates: z
      .object(Object.fromEntries(categories.map((category) => [category, z.array(item).max(100)])) as Record<
        (typeof categories)[number],
        z.ZodArray<typeof item>
      >)
      .strict(),
    // Optional, so a desktop app from before templates could be chosen
    // (v0.12) still saves its settings: the built-ins then.
    defaultTemplates: z
      .object({ adventure: templateId, campaign: templateId })
      .strict()
      .default(() => defaultSettings().defaultTemplates),
    author: text,
    copyright: text,
    licence: text,
    system: text,
  })
  .strict() satisfies z.ZodType<Settings>;

// The user's settings, or the built-in defaults until they first save.
export async function getSettings(db: Queryable, userId: string): Promise<Settings> {
  const row = await db.queryOne<{ settings: unknown }>('select settings from user_settings where user_id = $1', [
    userId,
  ]);
  if (!row) return defaultSettings();
  const parsed = settingsSchema.safeParse(row.settings);
  return parsed.success ? parsed.data : defaultSettings();
}

export async function settingsRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/settings', async (req) => getSettings(db, requireSession(req).user.id));

  // The whole object, validated; what is stored is what the next GET answers.
  app.put('/api/settings', async (req) => {
    const { user } = requireSession(req);
    const settings = parseBody(settingsSchema, req.body);
    await db.query(
      `insert into user_settings (user_id, settings) values ($1, $2)
       on conflict (user_id) do update set settings = excluded.settings, updated_at = now()`,
      [user.id, JSON.stringify(settings)],
    );
    return settings;
  });
}
