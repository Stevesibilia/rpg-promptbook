import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  categories,
  createProjectDoc,
  skeletonDocument,
  statuses,
  type CampaignRef,
  type Category,
} from 'promptbook-project';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { binProject, campaignsOf, getProject, insertProject, listProjects, restoreProject } from '../projects.js';
import type { Sync } from '../sync.js';
import { parseBody } from '../validation.js';
import { getSettings } from './settings.js';

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

// The campaign a new or imported project goes into: one of the user's
// campaigns not in the bin, and never for a campaign (a campaign is not
// nested).
export function campaignFor(
  category: Category,
  campaignId: string | null,
  campaigns: readonly CampaignRef[],
): CampaignRef | null {
  if (campaignId === null) return null;
  const campaign = category === 'campaign' ? undefined : campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw new AppError(400, 'invalid_campaign', 'campaignId: is not one of your campaigns.');
  return campaign;
}

export async function projectsRoutes(app: FastifyInstance, { db, sync }: { db: Db; sync: Sync }) {
  app.get('/api/projects', async (req) => {
    const { user } = requireSession(req);
    const { bin } = req.query as { bin?: string };
    return { projects: await listProjects(db, user.id, { bin: bin === '1' }) };
  });

  // A new project from the user's templates: the category's to-do list and
  // the skeleton document with the settings' defaults in its front matter.
  app.post('/api/projects', async (req, reply) => {
    const { user } = requireSession(req);
    const body = parseBody(createBody, req.body);
    const settings = await getSettings(db, user.id);
    const id = randomUUID();
    await db.withTransaction(async (tx) => {
      const campaign = campaignFor(body.category, body.campaignId, await campaignsOf(tx, user.id));
      const system = body.system ?? settings.system;
      const doc = createProjectDoc({
        id,
        title: body.title,
        category: body.category,
        status: body.status,
        campaignId: campaign?.id ?? null,
        system,
        seed: body.seed,
        todo: settings.todoTemplates[body.category],
        document: skeletonDocument(body.category, {
          title: body.title,
          system,
          campaignTitle: campaign?.title ?? null,
          author: settings.author,
          copyright: settings.copyright,
          licence: settings.licence,
        }),
      });
      await insertProject(tx, user.id, doc);
    });
    return reply.code(201).send({ project: await getProject(db, user.id, id) });
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
