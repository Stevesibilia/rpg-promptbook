import type { FastifyInstance } from 'fastify';
import { categories, statuses } from 'promptbook-project';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import {
  binProject,
  createProject,
  createWithId,
  getProject,
  insertProject,
  listProjects,
  readUploadedState,
  restoreProject,
} from '../projects.js';
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
  // Chosen by the desktop app, which made the project on the device.
  id: z.uuid().optional(),
});

// The desktop app's upload of a project made on the device (desktop-app
// design decision 9): its id and its document, base64. Every other field is
// in the document. The state's size is checked once decoded, against
// MAX_STATE_BYTES, within the route's body limit.
const uploadBody = z.object({ id: z.uuid(), state: z.string() });

// Room for the largest state in base64 and the JSON around it.
const UPLOAD_BODY_LIMIT = 8 * 1024 * 1024;

export async function projectsRoutes(app: FastifyInstance, { db, sync }: { db: Db; sync: Sync }) {
  app.get('/api/projects', async (req) => {
    const { user } = requireSession(req);
    const { bin } = req.query as { bin?: string };
    return { projects: await listProjects(db, user.id, { bin: bin === '1' }) };
  });

  // A new project from the user's templates, or the desktop app's upload of
  // one it made on the device. 201 when it is new; 200 when the owner sends
  // an id again, which changes nothing.
  app.post('/api/projects', { bodyLimit: UPLOAD_BODY_LIMIT }, async (req, reply) => {
    const { user } = requireSession(req);
    if ((req.body as { state?: unknown } | null)?.state !== undefined) {
      const { id, state } = parseBody(uploadBody, req.body);
      const doc = readUploadedState(id, state);
      const { project, created } = await createWithId(db, user.id, id, () =>
        db.withTransaction((tx) => insertProject(tx, user.id, doc)),
      );
      return reply.code(created ? 201 : 200).send({ project });
    }
    const { id, ...input } = parseBody(createBody, req.body);
    if (id === undefined) return reply.code(201).send({ project: await createProject(db, user.id, input) });
    const { project, created } = await createWithId(db, user.id, id, () => createProject(db, user.id, input, id));
    return reply.code(created ? 201 : 200).send({ project });
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
