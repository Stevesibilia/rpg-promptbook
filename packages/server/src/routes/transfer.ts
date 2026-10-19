import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { categories, createProjectDoc, exportFolderName, exportProject, prepareImport } from 'promptbook-project';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Db } from '../db.js';
import { campaignsOf, getProject, insertProject, listProjects, loadProjectDoc, type ProjectRow } from '../projects.js';
import type { Sync } from '../sync.js';
import { parseBody } from '../validation.js';
import { campaignFor, NOT_FOUND } from './projects.js';
import { getSettings } from './settings.js';

// Markdown import and export (design decision 7).

export const IMPORT_BODY_LIMIT = 20 * 1024 * 1024;

const importBody = z.object({
  notes: z
    .array(
      z.object({
        text: z.string(),
        fileName: z.string().max(1000),
        // The note's own title when not given.
        title: z.string().trim().min(1).max(200).optional(),
        category: z.enum(categories),
        // The campaign the note names when not given; null for stand-alone.
        campaignId: z.uuid().nullable().optional(),
      }),
    )
    .min(1, 'at least one note')
    .max(1000),
});

// A download name for Content-Disposition: an ASCII fallback and the UTF-8
// original.
function attachment(reply: FastifyReply, name: string): FastifyReply {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return reply
    .type('application/zip')
    .header('content-disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
}

export async function transferRoutes(app: FastifyInstance, { db, sync }: { db: Db; sync: Sync }) {
  // Every note becomes one new project, converted here whatever the client
  // previewed; all of them or none.
  app.post('/api/import', { bodyLimit: IMPORT_BODY_LIMIT }, async (req) => {
    const { user } = requireSession(req);
    const { notes } = parseBody(importBody, req.body);
    const settings = await getSettings(db, user.id);
    const created = await db.withTransaction(async (tx) => {
      const campaigns = await campaignsOf(tx, user.id);
      const results = [];
      for (const note of notes) {
        const prepared = prepareImport(note.text, { fileName: note.fileName, campaigns });
        const proposed = note.category === 'campaign' ? null : prepared.campaignId;
        const campaign = campaignFor(note.category, note.campaignId === undefined ? proposed : note.campaignId, campaigns);
        const id = randomUUID();
        const doc = createProjectDoc({
          id,
          title: note.title ?? prepared.title,
          category: note.category,
          status: 'draft',
          campaignId: campaign?.id ?? null,
          system: '',
          todo: settings.todoTemplates[note.category],
          document: prepared.text,
        });
        await insertProject(tx, user.id, doc);
        results.push({ id, report: prepared.report, imagesNotImported: prepared.imageRefs.length });
      }
      return results;
    });
    const results = [];
    for (const { id, report, imagesNotImported } of created) {
      results.push({ project: await getProject(db, user.id, id), report, imagesNotImported });
    }
    return { results };
  });

  // The files of one project's folder, from the open document when a client
  // has it, so edits not yet stored are in the export too.
  async function folder(project: ProjectRow, titles: Map<string, string>): Promise<Zippable> {
    const doc = sync.liveDocument(project.id) ?? (await loadProjectDoc(db, project.id));
    if (!doc) return {};
    const files = exportProject(doc, {
      campaignTitle: project.campaignId ? (titles.get(project.campaignId) ?? null) : null,
      editedAt: project.editedAt,
    });
    return Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]));
  }

  const campaignTitles = async (userId: string) =>
    new Map((await campaignsOf(db, userId)).map((c) => [c.id, c.title]));

  app.get('/api/projects/:id/export', async (req, reply) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    const project = await getProject(db, user.id, id);
    if (!project || project.deletedAt) throw NOT_FOUND();
    const name = exportFolderName(project.title, new Set());
    const zip = zipSync({ [name]: await folder(project, await campaignTitles(user.id)) });
    return attachment(reply, `${name}.zip`).send(Buffer.from(zip));
  });

  // Every project not in the bin, one folder each.
  app.get('/api/export', async (req, reply) => {
    const { user } = requireSession(req);
    const projects = await listProjects(db, user.id, { bin: false });
    const titles = await campaignTitles(user.id);
    const taken = new Set<string>();
    const tree: Zippable = {};
    for (const project of projects) tree[exportFolderName(project.title, taken)] = await folder(project, titles);
    const date = new Date().toISOString().slice(0, 10);
    return attachment(reply, `promptbook-${date}.zip`).send(Buffer.from(zipSync(tree)));
  });
}
