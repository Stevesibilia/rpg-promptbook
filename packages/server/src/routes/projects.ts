import type { FastifyInstance } from 'fastify';
import { categories, statuses } from 'promptbook-project';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { binProject, createProject, getProject, listProjects, restoreProject } from '../projects.js';
import type { Sync } from '../sync.js';
import { parseBody } from '../validation.js';

export const NOT_FOUND = () => new AppError(404, 'not_found', 'Not found.');

const title = z.string().trim().min(1, 'is required').max(200);

const createBody = z.object({
  category: z.enum(categories),
  title,
  campaignId: z.uuid().nullable().default(null),
  // The settings' default system when not given.
  system: z.string().trim().max(200).optional(),
  status: z.enum(statuses).default('draft'),
  seed: z.string().max(10_000).default(''),
});

export async function projectsRoutes(app: FastifyInstance, { db, sync }: { db: Db; sync: Sync }) {
  app.get('/api/projects', async (req) => {
    const { user } = requireSession(req);
    const { bin } = req.query as { bin?: string };
    return { projects: await listProjects(db, user.id, { bin: bin === '1' }) };
  });

  // A new project from the user's templates.
  app.post('/api/projects', async (req, reply) => {
    const { user } = requireSession(req);
    const project = await createProject(db, user.id, parseBody(createBody, req.body));
    return reply.code(201).send({ project });
  });

  // To the bin; whoever has it open is told and disconnected.
  app.delete('/api/projects/:id', async (req, reply) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    if (!(await binProject(db, user.id, id))) throw NOT_FOUND();
    sync.closeProject(id);
    return reply.code(204).send();
  });

  app.post('/api/projects/:id/restore', async (req) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    if (!(await restoreProject(db, user.id, id))) throw NOT_FOUND();
    return { project: await getProject(db, user.id, id) };
  });
}
