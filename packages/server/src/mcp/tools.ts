import type { McpServer } from '@modelcontextprotocol/server';
import { templates } from 'promptbook-format';
import {
  addInspirationItem,
  addLogEntry,
  addTodo,
  addTopic,
  categories,
  inspirationKinds,
  isWebUrl,
  LIMITS,
  readDocument,
  readInspiration,
  readLog,
  readMeta,
  readNotes,
  readTodo,
  readTopics,
  sameName,
  saveNote,
  seedVersions,
  statuses,
  targetsOf,
  currentSeed,
  type ResearchTopic,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { withLiveDocument } from '../live.js';
import { createProject, getProject, listProjects, loadProjectDoc, type ProjectRow } from '../projects.js';
import { textHash } from '../snapshots.js';
import { INSUFFICIENT_SCOPE, RateLimited, toToolError } from './errors.js';
import { registerBoardTools } from './board.js';
import { addScene, check, locate, MARKDOWN_MAX, replaceSection } from './edits.js';
import type { McpCaller, McpDeps } from './server.js';

// The project as a set of tools (connector design decision 11). Every tool
// acts as the grant's user, on that user's projects only and never on one in
// the bin. Write tools need read_write. No tool writes the seed, ticks or
// removes a to-do item, or deletes anything: those are the user's, in the
// app.

export const TOOL_NAMES = [
  'list_projects',
  'get_project',
  'create_project',
  'get_outline',
  'read_document',
  'replace_section',
  'add_scene',
  'list_todo',
  'add_todo',
  'get_inspiration',
  'add_inspiration_item',
  'list_research',
  'get_research_note',
  'save_research_note',
  'add_research_topic',
  'get_brainstorm_log',
  'add_brainstorm_entry',
  'get_board',
  'set_scene_prompts',
] as const;

const READ_LOG_FIRST = 'At the start of a new chat about a project, read its brainstorm log first.';

export const INSTRUCTIONS = [
  'Promptbook holds the prep of tabletop role-playing games: campaigns, adventures and one-shots.',
  `${READ_LOG_FIRST} At the end of a brainstorm, write one entry with add_brainstorm_entry: the ideas, the decisions, the rejected ideas with why, and the open questions.`,
  'To edit the prep document, read the section first with read_document, then send replace_section the hash you read, keeping the heading. The template’s field names (Luogo e momento, [!leggi]…) stay in Italian.',
  'For a board’s prompts, read get_board first, then write one scene at a time with set_scene_prompts.',
].join('\n');

// What a scene needs so that adding it adds no error, read from the
// template: a scene missing any of it is written, with the problems reported.
const template = templates.avventura;
const fieldText = (f: (typeof template.sceneFields)[number]) =>
  f.form === 'inline' ? `**${f.label}:** …` : `**${f.label}** followed by a list`;
const SCENE_REQUIRED = [
  ...template.callouts
    .filter((c) => (c.allowedIn as readonly string[]).includes('scene') && c.perPlace.min > 0)
    .map((c) => `a > [!${c.type}] box`),
  ...template.sceneFields.filter((f) => f.requirement === 'required').map(fieldText),
  ...(template.tables.reactions.requirement === 'required'
    ? [`a table whose first header is «${template.tables.reactions.firstHeader}»`]
    : []),
];
const SCENE_RECOMMENDED = template.sceneFields.filter((f) => f.requirement === 'recommended').map(fieldText);

// Ids of projects and items: anything else simply finds nothing.
const id = z.string().trim().min(1).max(64);
const projectId = id.describe('The project’s id, from list_projects.');
const text = (max: number) => z.string().max(max);
const requiredText = (max: number) => z.string().trim().min(1, 'is required').max(max);
const list = z.array(text(LIMITS.text)).max(LIMITS.list);
const webUrl = z
  .string()
  .max(LIMITS.url)
  .refine(isWebUrl, 'must be an http or https address');
const HASH = /^[0-9a-f]{64}$/i;

interface Hints {
  title: string;
  readOnly: boolean;
  idempotent: boolean;
  destructive?: boolean;
}

type ToolName = (typeof TOOL_NAMES)[number];

// What a group of tools in another file needs of registerTools: the wrapper
// every tool runs through, the caller's project and document, and the schemas
// the tools share.
export interface ToolKit {
  tool<Shape extends z.ZodRawShape>(
    name: ToolName,
    description: string,
    hints: Hints,
    shape: Shape,
    run: (args: z.output<z.ZodObject<Shape>>) => Promise<unknown>,
  ): void;
  projectOf(id: string): Promise<ProjectRow>;
  docOf(project: ProjectRow): Promise<Y.Doc>;
  write<T>(project: ProjectRow, fn: (doc: Y.Doc) => T): Promise<T>;
  schemas: { projectId: typeof projectId; requiredText: typeof requiredText; text: typeof text };
}

export function registerTools(server: McpServer, caller: McpCaller, { db, sync, log, quota }: McpDeps): void {
  // Every tool runs through here: the scope check, one envelope for the
  // answer, one translation of failures.
  const tool = <Shape extends z.ZodRawShape>(
    name: ToolName,
    description: string,
    hints: Hints,
    shape: Shape,
    run: (args: z.output<z.ZodObject<Shape>>) => Promise<unknown>,
  ): void => {
    server.registerTool(
      name,
      {
        description,
        annotations: {
          title: hints.title,
          readOnlyHint: hints.readOnly,
          destructiveHint: hints.destructive ?? false,
          idempotentHint: hints.idempotent,
          openWorldHint: false,
        },
        inputSchema: z.strictObject(shape),
      },
      (async (args: unknown) => {
        try {
          if (!hints.readOnly) {
            if (caller.scope !== 'read_write') throw INSUFFICIENT_SCOPE();
            const wait = quota.take(caller.grantId);
            if (wait !== null) throw new RateLimited(wait);
          }
          const result = await run(args as never);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (thrown) {
          return toToolError(thrown, log, name);
        }
      }) as never,
    );
  };

  // The caller's project, not in the bin; anything else is not found.
  async function projectOf(id: string): Promise<ProjectRow> {
    const project = await getProject(db, caller.userId, id);
    if (!project || project.deletedAt) {
      throw new AppError(404, 'not_found', 'No project with that id. list_projects shows the ones you can use.');
    }
    return project;
  }

  // The document as open editors have it, or as stored.
  async function docOf(project: ProjectRow): Promise<Y.Doc> {
    const doc = sync.liveDocument(project.id) ?? (await loadProjectDoc(db, project.id));
    if (!doc) throw new AppError(409, 'no_document', 'This project has no stored document yet.');
    return doc;
  }

  // One write through the live document. The writers check their input and
  // the collection caps before changing anything; what they refuse is the
  // caller's to correct.
  function write<T>(project: ProjectRow, fn: (doc: Y.Doc) => T): Promise<T> {
    return withLiveDocument(sync, project.id, caller.userId, (doc) => {
      try {
        return fn(doc);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(400, 'invalid_input', error instanceof Error ? error.message : 'The input was refused.');
      }
    });
  }

  const progress = (doc: Y.Doc) => {
    const todo = readTodo(doc);
    return { done: todo.filter((t) => t.done).length, total: todo.length };
  };

  // Projects.

  tool(
    'list_projects',
    `List your Promptbook projects that are not in the bin, newest edit first. ${READ_LOG_FIRST}`,
    { title: 'List projects', readOnly: true, idempotent: true },
    {
      category: z.enum(categories).optional().describe('Only campaigns, adventures or one-shots.'),
      status: z.enum(statuses).optional(),
    },
    async (args) => {
      const projects = await listProjects(db, caller.userId, { bin: false });
      const titles = new Map(projects.map((p) => [p.id, p.title]));
      return projects
        .filter((p) => (!args.category || p.category === args.category) && (!args.status || p.status === args.status))
        .map((p) => ({
          id: p.id,
          title: p.title,
          category: p.category,
          status: p.status,
          campaign: p.campaignId ? { id: p.campaignId, title: titles.get(p.campaignId) ?? null } : null,
          todo: { done: p.todoDone, total: p.todoTotal },
          scenes: p.scenes,
          errors: p.errors,
          warnings: p.warnings,
          editedAt: p.editedAt,
        }));
    },
  );

  tool(
    'get_project',
    `One project: its details, current seed, to-do list and counts. ${READ_LOG_FIRST}`,
    { title: 'Get a project', readOnly: true, idempotent: true },
    { projectId },
    async (args) => {
      const project = await projectOf(args.projectId);
      const doc = await docOf(project);
      const meta = readMeta(doc);
      const campaign = project.campaignId ? await getProject(db, caller.userId, project.campaignId) : null;
      const log = readLog(doc);
      return {
        id: project.id,
        title: meta.title,
        category: meta.category,
        status: meta.status,
        system: meta.system,
        campaign: campaign && !campaign.deletedAt ? { id: campaign.id, title: campaign.title } : null,
        createdAt: meta.createdAt,
        editedAt: project.editedAt,
        seed: currentSeed(doc),
        todo: {
          ...progress(doc),
          items: readTodo(doc).map((t) => ({ text: t.text, done: t.done, note: t.note, due: t.due })),
        },
        counts: {
          scenes: project.scenes,
          words: project.words,
          errors: project.errors,
          warnings: project.warnings,
          inspiration: readInspiration(doc).length,
          topics: readTopics(doc).length,
          notes: readNotes(doc).length,
          logEntries: log.length,
        },
        lastLogEntryAt: log[0]?.at ?? null,
      };
    },
  );

  tool(
    'create_project',
    'Create a project as a draft, with your settings’ skeleton document and to-do list for its category, and no seed. Returns its id.',
    { title: 'Create a project', readOnly: false, idempotent: false },
    {
      title: requiredText(LIMITS.name),
      category: z.enum(categories),
      campaignId: id.optional().describe('A campaign of yours to put an adventure or a one-shot in.'),
    },
    async (args) => {
      if (args.campaignId !== undefined) {
        const campaign = await getProject(db, caller.userId, args.campaignId);
        if (!campaign || campaign.deletedAt || campaign.category !== 'campaign' || args.category === 'campaign') {
          throw new AppError(400, 'invalid_campaign', 'campaignId: is not one of your campaigns.');
        }
      }
      const project = await createProject(db, caller.userId, {
        title: args.title,
        category: args.category,
        campaignId: args.campaignId ?? null,
      });
      return { id: project.id, project };
    },
  );

  // The prep document.

  tool(
    'get_outline',
    'The parts of a project’s prep document you can read and replace one at a time: sections, scenes (by id, S3) and sheets of an adventure or one-shot, with the errors and warnings in each; the ## and ### headings of a campaign, which is not checked.',
    { title: 'Get the outline', readOnly: true, idempotent: true },
    { projectId },
    async (args) => {
      const project = await projectOf(args.projectId);
      const text = readDocument(await docOf(project));
      const checked = check(text, project.category);
      const targets = targetsOf(text, project.category).map((t) => {
        if (!checked) return { kind: t.kind, target: t.target, title: t.title };
        const inside = checked.problems.filter((p) => p.range.start.offset >= t.from && p.range.start.offset <= t.to);
        return {
          kind: t.kind,
          target: t.target,
          title: t.title,
          errors: inside.filter((p) => p.severity === 'error').length,
          warnings: inside.filter((p) => p.severity === 'warning').length,
        };
      });
      return checked
        ? { checked: true, errors: checked.errors, warnings: checked.warnings, targets }
        : { checked: false, targets };
    },
  );

  tool(
    'read_document',
    'Read a project’s prep document in Markdown: the whole of it, or one target from get_outline (a section’s name, a scene id such as S3, a sheet’s name; for a campaign a heading’s text). Answers the text and its hash, which replace_section needs.',
    { title: 'Read the document', readOnly: true, idempotent: true },
    {
      projectId,
      target: requiredText(LIMITS.name).optional().describe('Omit for the whole document.'),
    },
    async (args) => {
      const project = await projectOf(args.projectId);
      const text = readDocument(await docOf(project));
      if (args.target === undefined) return { text, hash: textHash(text) };
      const target = locate(text, project.category, args.target);
      const span = text.slice(target.from, target.to);
      return { target: target.target, kind: target.kind, title: target.title, text: span, hash: textHash(span) };
    },
  );

  tool(
    'replace_section',
    'Replace one target of a project’s prep document (a section, a scene or a sheet; a heading of a campaign), heading included. Read it first with read_document and send the hash you read: if the user changed it since, the call is refused and you read it again. Keep the heading as it is (a scene keeps its id); the template’s field names stay in Italian. In an adventure or a one-shot the result reports the errors and warnings before and after, and the problems in the new text: problems are reported, never refused, so fix them in later edits when you can. A snapshot of the text before the edit is kept, and the user can undo it.',
    { title: 'Replace a section', readOnly: false, idempotent: false, destructive: true },
    {
      projectId,
      target: requiredText(LIMITS.name).describe('The target as read_document named it.'),
      markdown: z.string().min(1, 'is required').max(MARKDOWN_MAX).describe('The new text, heading included.'),
      hash: z.string().regex(HASH, 'must be the 64-character hash read_document answered'),
    },
    async (args) => {
      const project = await projectOf(args.projectId);
      return replaceSection(db, sync, project, caller.userId, caller.grantId, args);
    },
  );

  tool(
    'add_scene',
    'Add a scene at the end of the «Scene» section of an adventure or a one-shot, with the next id (S1, S2…). Send the title and the scene’s body without its heading; the template’s field names stay in Italian. ' +
      `The body needs, or the result reports an error: ${SCENE_REQUIRED.join('; ')}. ` +
      'Problems never refuse the scene: it is written and the result lists them; fix them in later edits when you can. ' +
      (SCENE_RECOMMENDED.length ? `Recommended (a warning when missing): ${SCENE_RECOMMENDED.join('; ')}. ` : '') +
      'A snapshot is kept first, and the user can undo it.',
    { title: 'Add a scene', readOnly: false, idempotent: false },
    {
      projectId,
      title: requiredText(LIMITS.name).regex(/^[^\r\n]*$/, 'must be one line'),
      markdown: z.string().max(MARKDOWN_MAX).describe('The scene’s body, without its ### heading.'),
    },
    async (args) => {
      const project = await projectOf(args.projectId);
      return addScene(db, sync, project, caller.userId, caller.grantId, args);
    },
  );

  // To-do.

  tool(
    'list_todo',
    'A project’s to-do list, in order, and its progress.',
    { title: 'List the to-do items', readOnly: true, idempotent: true },
    { projectId },
    async (args) => {
      const doc = await docOf(await projectOf(args.projectId));
      return {
        ...progress(doc),
        items: readTodo(doc).map((t) => ({ text: t.text, done: t.done, note: t.note, due: t.due })),
      };
    },
  );

  tool(
    'add_todo',
    'Add items at the end of a project’s to-do list. Only the user ticks or removes items.',
    { title: 'Add to-do items', readOnly: false, idempotent: false },
    { projectId, items: z.array(requiredText(LIMITS.text)).min(1).max(20) },
    async (args) => {
      const project = await projectOf(args.projectId);
      const added = await write(project, (doc) => args.items.map((item) => ({ id: addTodo(doc, item), text: item })));
      return { added };
    },
  );

  // Inspiration.

  tool(
    'get_inspiration',
    'A project’s seed, every version with its date (the current one last), and its sources of inspiration, newest first. The seed is the user’s: read it, never rewrite it.',
    { title: 'Get the inspiration', readOnly: true, idempotent: true },
    { projectId },
    async (args) => {
      const doc = await docOf(await projectOf(args.projectId));
      return { seed: seedVersions(doc), items: readInspiration(doc) };
    },
  );

  tool(
    'add_inspiration_item',
    'Add a source of inspiration to a project: a link or an image (with its address), a quote or a note, and why it matters for this project.',
    { title: 'Add a source of inspiration', readOnly: false, idempotent: false },
    {
      projectId,
      kind: z.enum(inspirationKinds),
      text: requiredText(LIMITS.text).describe('The title of a link or an image, the quote, or the note.'),
      url: webUrl.optional().describe('Required for a link or an image; not for a quote or a note.'),
      why: text(LIMITS.text).describe('Why it matters for this project.'),
    },
    async (args) => {
      const linked = args.kind === 'link' || args.kind === 'image';
      if (linked !== (args.url !== undefined)) {
        throw new AppError(400, 'invalid_input', linked ? 'url: is required for a link or an image.' : 'url: only a link or an image has one.');
      }
      const project = await projectOf(args.projectId);
      const item = await write(project, (doc) =>
        addInspirationItem(doc, { kind: args.kind, text: args.text, url: args.url ?? '', why: args.why, by: 'claude' }),
      );
      return { item };
    },
  );

  // Research.

  tool(
    'list_research',
    'A project’s research topics, oldest first, with their state (open, or noted once a note exists), and the headers of its research notes.',
    { title: 'List the research', readOnly: true, idempotent: true },
    { projectId },
    async (args) => {
      const doc = await docOf(await projectOf(args.projectId));
      return {
        topics: readTopics(doc),
        notes: readNotes(doc).map((n) => ({
          id: n.id,
          topic: n.topic,
          by: n.by,
          at: n.at,
          editedAt: n.editedAt,
          sources: n.sources.length,
        })),
      };
    },
  );

  tool(
    'get_research_note',
    'One research note, by its id or by its topic: summary, facts and sources.',
    { title: 'Get a research note', readOnly: true, idempotent: true },
    {
      projectId,
      noteId: id.optional(),
      topic: requiredText(LIMITS.name).optional(),
    },
    async (args) => {
      if ((args.noteId === undefined) === (args.topic === undefined)) {
        throw new AppError(400, 'invalid_input', 'Send noteId or topic, one of the two.');
      }
      const notes = readNotes(await docOf(await projectOf(args.projectId)));
      const note = notes.find((n) => (args.noteId !== undefined ? n.id === args.noteId : sameName(n.topic, args.topic!)));
      if (!note) throw new AppError(404, 'not_found', 'No research note with that id or topic. list_research shows them.');
      return { note };
    },
  );

  tool(
    'save_research_note',
    'Save what you researched on a topic: a summary, the facts, and the sources with the date you read them. Creates the note, or replaces the summary, facts and sources of the note on the same topic; the topic is then marked noted.',
    { title: 'Save a research note', readOnly: false, idempotent: true },
    {
      projectId,
      topic: requiredText(LIMITS.name),
      summary: text(LIMITS.summary),
      facts: list,
      sources: z
        .array(
          z.strictObject({
            title: requiredText(LIMITS.name),
            url: webUrl,
            accessed: z.union([z.literal(''), z.iso.date()]).describe('YYYY-MM-DD, or empty when not known.'),
          }),
        )
        .max(LIMITS.sources),
    },
    async (args) => {
      const project = await projectOf(args.projectId);
      return write(project, (doc) =>
        saveNote(doc, { topic: args.topic, summary: args.summary, facts: args.facts, sources: args.sources, by: 'claude' }),
      );
    },
  );

  tool(
    'add_research_topic',
    'Add topics to research to a project. A topic already there, compared without case or accents, is skipped and named.',
    { title: 'Add research topics', readOnly: false, idempotent: true },
    { projectId, names: z.array(requiredText(LIMITS.name)).min(1).max(20) },
    async (args) => {
      const project = await projectOf(args.projectId);
      return write(project, (doc) => {
        const added: ResearchTopic[] = [];
        const skipped: string[] = [];
        for (const name of args.names) {
          const topic = addTopic(doc, name);
          if (topic) added.push(topic);
          else skipped.push(name);
        }
        return { added, skipped };
      });
    },
  );

  // The brainstorm log.

  tool(
    'get_brainstorm_log',
    `A project’s brainstorm log, newest entry first: what earlier chats decided. ${READ_LOG_FIRST}`,
    { title: 'Get the brainstorm log', readOnly: true, idempotent: true },
    { projectId, limit: z.number().int().min(1).max(50).optional().describe('At most this many entries; 10 when omitted.') },
    async (args) => {
      const entries = readLog(await docOf(await projectOf(args.projectId)));
      return { entries: entries.slice(0, args.limit ?? 10), total: entries.length };
    },
  );

  tool(
    'add_brainstorm_entry',
    'Write one entry at the end of a brainstorm about a project: a title, the ideas, the decisions, the rejected ideas each with why, and the open questions. It is dated now, and the next chat reads it first.',
    { title: 'Add a brainstorm entry', readOnly: false, idempotent: false },
    {
      projectId,
      title: requiredText(LIMITS.name),
      ideas: list,
      decisions: list,
      rejected: z.array(z.strictObject({ idea: requiredText(LIMITS.text), why: text(LIMITS.text) })).max(LIMITS.list),
      questions: list,
    },
    async (args) => {
      const project = await projectOf(args.projectId);
      const entry = await write(project, (doc) =>
        addLogEntry(doc, {
          title: args.title,
          ideas: args.ideas,
          decisions: args.decisions,
          rejected: args.rejected,
          questions: args.questions,
          by: 'claude',
        }),
      );
      return { entry };
    },
  );

  registerBoardTools({ tool, projectOf, docOf, write, schemas: { projectId, requiredText, text } });
}
