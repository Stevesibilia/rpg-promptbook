import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { Db } from '../db.js';

// Public. Answers 503 while the database cannot be reached, and always says
// which release is running, so a deploy can prove the new one is live. Logged
// only on warnings: the container health check calls it every few seconds.
export async function healthRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }) {
  const version = config.appVersion;
  app.get('/api/health', { logLevel: 'warn' }, async (_req, reply) => {
    try {
      await db.query('select 1');
      return { ok: true, version };
    } catch {
      return reply.code(503).send({ ok: false, version });
    }
  });
}
