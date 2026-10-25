import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Db } from '../db.js';
import {
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  saveTemplateVersion,
  templateUsage,
} from '../templates.js';
import { parseBody } from '../validation.js';

// The account's document templates (template-editor design decision 3).
// Every route is the signed-in account's own: another account's template
// answers as not found.

export const templateRefSchema = z.object({
  id: z.string().trim().min(1).max(64),
  version: z.int().positive(),
});

const duplicateBody = z.object({
  from: templateRefSchema,
  name: z.string().trim().min(1, 'is required').max(200),
});

const versionBody = z.object({
  baseVersion: z.int().positive(),
  // Validated as a template once the path's id and the next version are set.
  body: z.record(z.string(), z.unknown()),
  note: z.string().trim().max(500).default(''),
});

export async function templatesRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Every version of every template, and the projects using each version.
  app.get('/api/templates', async (req) => {
    const { user } = requireSession(req);
    const [templates, usage] = await Promise.all([listTemplates(db, user.id), templateUsage(db, user.id)]);
    return { templates, usage };
  });

  app.post('/api/templates', async (req, reply) => {
    const { user } = requireSession(req);
    const { from, name } = parseBody(duplicateBody, req.body);
    return reply.code(201).send(await duplicateTemplate(db, user.id, from, name));
  });

  app.post('/api/templates/:id/versions', async (req, reply) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    const input = parseBody(versionBody, req.body);
    return reply.code(201).send(await saveTemplateVersion(db, user.id, id, input));
  });

  app.delete('/api/templates/:id', async (req, reply) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    await deleteTemplate(db, user.id, id);
    return reply.code(204).send();
  });
}
