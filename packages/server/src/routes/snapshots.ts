import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Db } from '../db.js';
import { getProject, type ProjectRow } from '../projects.js';
import {
  createUserSnapshot,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  restoreSnapshot,
  snapshotKinds,
  undoClaudeEdit,
} from '../snapshots.js';
import type { Sync } from '../sync.js';
import { parseBody } from '../validation.js';
import { NOT_FOUND } from './projects.js';

// Snapshots of the prep document (connector design decisions 6 and 13).
// Session only; a project not the user's or in the bin is not found.

const listQuery = z.object({
  kind: z.enum(snapshotKinds).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const createBody = z.object({ label: z.string().trim().min(1, 'is required').max(200) });

export async function snapshotsRoutes(app: FastifyInstance, { db, sync }: { db: Db; sync: Sync }) {
  async function projectOf(userId: string, id: string): Promise<ProjectRow> {
    const project = await getProject(db, userId, id);
    if (!project || project.deletedAt) throw NOT_FOUND();
    return project;
  }

  app.get('/api/projects/:id/snapshots', async (req) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    const project = await projectOf(user.id, id);
    const query = parseBody(listQuery, req.query);
    return { snapshots: await listSnapshots(db, project.id, query) };
  });

  app.post('/api/projects/:id/snapshots', async (req, reply) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    const project = await projectOf(user.id, id);
    const { label } = parseBody(createBody, req.body);
    return reply.code(201).send({ snapshot: await createUserSnapshot(db, sync, project, label) });
  });

  app.get('/api/projects/:id/snapshots/:sid', async (req) => {
    const { user } = requireSession(req);
    const { id, sid } = req.params as { id: string; sid: string };
    const project = await projectOf(user.id, id);
    const snapshot = await getSnapshot(db, project.id, sid);
    if (!snapshot) throw NOT_FOUND();
    return { snapshot };
  });

  // Answers the restore snapshot of the text that was replaced.
  app.post('/api/projects/:id/snapshots/:sid/restore', async (req) => {
    const { user } = requireSession(req);
    const { id, sid } = req.params as { id: string; sid: string };
    const project = await projectOf(user.id, id);
    return { snapshot: await restoreSnapshot(db, sync, project, user.id, sid) };
  });

  // Undoes a Claude edit; 409 section_changed when its part changed since.
  app.post('/api/projects/:id/snapshots/:sid/undo', async (req) => {
    const { user } = requireSession(req);
    const { id, sid } = req.params as { id: string; sid: string };
    const project = await projectOf(user.id, id);
    return { snapshot: await undoClaudeEdit(db, sync, project, user.id, sid) };
  });

  app.delete('/api/projects/:id/snapshots/:sid', async (req, reply) => {
    const { user } = requireSession(req);
    const { id, sid } = req.params as { id: string; sid: string };
    const project = await projectOf(user.id, id);
    await deleteSnapshot(db, project.id, sid);
    return reply.code(204).send();
  });
}
