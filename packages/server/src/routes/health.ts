import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';

// Public. Answers 503 while the database cannot be reached.
export async function healthRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/health', async (_req, reply) => {
    try {
      await db.query('select 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
}
