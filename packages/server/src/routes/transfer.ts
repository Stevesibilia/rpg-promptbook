import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Template } from 'promptbook-format';
import {
  categories,
  createProjectDoc,
  exportBoard,
  exportFolderName,
  exportProject,
  migratedView,
  prepareImport,
  type ExportFile,
} from 'promptbook-project';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { BlobStore } from '../files/blobs.js';
import {
  campaignFor,
  campaignsOf,
  getProject,
  insertProject,
  listProjects,
  loadProjectDoc,
  type ProjectRow,
} from '../projects.js';
import type { Sync } from '../sync.js';
import { accountTemplates } from '../templates.js';
import { parseBody } from '../validation.js';
import { NOT_FOUND } from './projects.js';
import { getSettings } from './settings.js';
import { send, ZIP_BYTES_MAX, ZIP_ENTRIES_MAX, zipWriter } from './zip.js';

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

export async function transferRoutes(
  app: FastifyInstance,
  { db, sync, blobs }: { db: Db; sync: Sync; blobs: BlobStore },
) {
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
          system: prepared.system,
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

  // What one project's folder holds: its text files, from the open document
  // when a client has it so edits not yet stored are in the export too, and
  // the board's files that the project links. The bytes are read later, one
  // file at a time.
  async function plan(
    project: ProjectRow,
    titles: Map<string, string>,
    folder: string,
    templates: Template[],
  ): Promise<{ folder: string; texts: Record<string, string>; files: ExportFile[]; missing: string[] }> {
    const stored = sync.liveDocument(project.id) ?? (await loadProjectDoc(db, project.id));
    if (!stored) return { folder, texts: {}, files: [], missing: [] };
    // A board from before image categories is exported migrated, without
    // writing to the document (image-categories design decision 2).
    const doc = migratedView(stored);
    const texts = exportProject(doc, {
      campaignTitle: project.campaignId ? (titles.get(project.campaignId) ?? null) : null,
      editedAt: project.editedAt,
      templates,
    });
    // The document is the user's to write, so a hash it names is read only
    // when this project's links list it: knowing a hash never grants a file.
    const linked = new Set(
      (await db.query<{ sha256: string }>('select sha256 from project_files where project_id = $1', [project.id])).map(
        (row) => row.sha256,
      ),
    );
    const listed = exportBoard(doc, templates).files;
    return {
      folder,
      texts,
      files: listed.filter((file) => linked.has(file.sha256)),
      missing: listed.filter((file) => !linked.has(file.sha256)).map((file) => file.path),
    };
  }

  const campaignTitles = async (userId: string) =>
    new Map((await campaignsOf(db, userId)).map((c) => [c.id, c.title]));

  // The zip as a stream of chunks, written as the files are read: the text
  // deflated, the images and tracks stored as they are (already compressed).
  // Nothing but the file being read is in memory, and the next one is not
  // read until the client has taken what came before.
  async function* zipChunks(
    projects: { project: ProjectRow; folder: string }[],
    titles: Map<string, string>,
    templates: Template[],
    log: FastifyInstance['log'],
  ): AsyncGenerator<Uint8Array> {
    const zip = zipWriter();
    const { flush, text } = zip;
    try {
      for (const { project, folder } of projects) {
        const { texts, files, missing } = await plan(project, titles, folder, templates);
        for (const [name, content] of Object.entries(texts)) text(`${folder}/${name}`, content);
        yield* flush();
        for (const file of files) {
          const blob = await blobs.get(file.sha256);
          if (!blob) {
            missing.push(file.path);
            continue;
          }
          yield* zip.stored(`${folder}/${file.path}`, blob.stream);
        }
        if (missing.length > 0) {
          log.warn({ project: project.id, missing: missing.length }, 'Export: files without bytes were left out');
          text(`${folder}/files-missing.txt`, `${missing.join('\n')}\n`);
          yield* flush();
        }
      }
      yield* zip.end();
    } finally {
      zip.terminate();
    }
  }

  // fflate's Zip writes 32-bit sizes and offsets and a 16-bit entry count, so
  // an archive past them would be silently corrupt: refuse it up front. The
  // links' sizes are what the export can read, each content once per project.
  async function checkFits(projectIds: string[]): Promise<void> {
    const row = await db.queryOne<{ bytes: string; entries: string }>(
      `select coalesce(sum(f.size), 0) as bytes, count(*) as entries
       from project_files pf join files f using (sha256) where pf.project_id = any($1::uuid[])`,
      [projectIds],
    );
    if (Number(row?.bytes ?? 0) > ZIP_BYTES_MAX || Number(row?.entries ?? 0) + 8 * projectIds.length > ZIP_ENTRIES_MAX) {
      throw new AppError(
        413,
        'export_too_large',
        'These projects hold more than 4 GB of images and tracks, more than one zip can take. Export fewer projects at a time.',
      );
    }
  }

  app.get('/api/projects/:id/export', async (req, reply) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    const project = await getProject(db, user.id, id);
    if (!project || project.deletedAt) throw NOT_FOUND();
    const folder = exportFolderName(project.title, new Set());
    await checkFits([project.id]);
    return send(reply, `${folder}.zip`, zipChunks([{ project, folder }], await campaignTitles(user.id), await accountTemplates(db, user.id), req.log));
  });

  // Every project not in the bin, one folder each.
  app.get('/api/export', async (req, reply) => {
    const { user } = requireSession(req);
    const projects = await listProjects(db, user.id, { bin: false });
    const taken = new Set<string>();
    const named = projects.map((project) => ({ project, folder: exportFolderName(project.title, taken) }));
    const date = new Date().toISOString().slice(0, 10);
    await checkFits(projects.map((p) => p.id));
    return send(reply, `promptbook-${date}.zip`, zipChunks(named, await campaignTitles(user.id), await accountTemplates(db, user.id), req.log));
  });
}
