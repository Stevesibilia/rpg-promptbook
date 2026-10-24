import {
  addImagePrompt,
  duplicateTitles,
  imageCategories,
  LIMITS,
  matchKey,
  migratedView,
  migrateImagePrompts,
  readDocumentBoard,
  removeImagePrompt,
  setFirstScenePrompt,
  setMusicPrompt,
  updateImagePrompt,
  type BoardRow,
  type DocumentBoard,
  type ImageCategory,
  type PromptRow,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { z } from 'zod';
import { AppError } from '../errors.js';
import type { ProjectRow } from '../projects.js';
import { ToolRefusal } from './errors.js';
import type { ToolKit } from './tools.js';

// The images and music board as tools (asset-board design decision 15,
// image-categories design decision 5): Claude reads which scenes, PCs, NPCs
// and handouts want prompts, writes the music one scene at a time and the
// image prompts one at a time. Problems in the document never refuse a
// write, and prompts are not versioned, so no snapshot is stored (asset-board
// decision 8). Every write first migrates a board from before image
// categories, in its transaction; get_board reads a migrated view and never
// writes.

const SINGULAR: Record<ImageCategory, string> = { scene: 'Scene', pc: 'PC', npc: 'NPC', handout: 'Handout' };

// «S1 · prompt 2», «NPC · Padre Anselmo».
const labelOf = ({ prompt, number }: PromptRow) =>
  prompt.category === 'scene' ? `${prompt.sceneId} · prompt ${number}` : `${SINGULAR[prompt.category]} · ${prompt.name}`;

// An image prompt as a model reads it.
const itemOut = (row: PromptRow) => {
  const { prompt } = row;
  const text = prompt.prompt !== '';
  return {
    id: prompt.id,
    category: prompt.category,
    ...(prompt.category === 'scene' ? { sceneId: prompt.sceneId } : { name: prompt.name }),
    number: row.number,
    prompt: text ? prompt.prompt : null,
    by: text ? prompt.by : null,
    at: text && prompt.at !== '' ? prompt.at : null,
    status: row.status,
    files: row.images.length,
    chosen: row.images.find((f) => f.id === row.chosen)?.name ?? null,
  };
};

// A scene as a model reads it.
const sceneOut = (row: BoardRow) => ({
  sceneId: row.sceneId,
  title: row.title,
  visual: row.visual,
  mood: row.mood,
  images: row.prompts.map(itemOut),
  music: {
    title: row.music?.title ?? null,
    style: row.music?.style ?? null,
    lyrics: row.music?.lyrics ?? null,
    by: row.music?.by ?? null,
    at: row.music?.at ?? null,
    status: row.musicStatus,
    tracks: row.tracks.length,
  },
});

const boardOut = (board: DocumentBoard) => ({
  appendix: board.rows.length > 0,
  scenes: board.rows.map(sceneOut),
  pcs: board.named.pc.map(itemOut),
  npcs: board.named.npc.map(itemOut),
  handouts: board.named.handout.map(itemOut),
  outsideAppendix: board.outsideAppendix.map(itemOut),
  unmatched: board.unmatched.length,
  duplicateTitles: duplicateTitles(board.rows),
});

// The prompts the board shows: those of the appendix's scenes, the PCs, the
// NPCs and the handouts.
const shownPrompts = (board: DocumentBoard): PromptRow[] => [
  ...board.rows.flatMap((row) => row.prompts),
  ...board.named.pc,
  ...board.named.npc,
  ...board.named.handout,
];

const allPrompts = (board: DocumentBoard): PromptRow[] => [...shownPrompts(board), ...board.outsideAppendix];

// The first six words of a prompt, compared as the board matches names.
const firstWords = (prompt: string) => matchKey(prompt.trim().split(/\s+/).slice(0, 6).join(' '));

// Midjourney names a download after the first words of its prompt, cut
// mid-word: two shown prompts whose first six words are the same, or one
// whose words start the other's, would both match its downloads.
function sharedWords(board: DocumentBoard, id: string): string[] {
  const all = shownPrompts(board);
  const written = all.find((p) => p.prompt.id === id);
  const key = written ? firstWords(written.prompt.prompt) : '';
  if (key === '') return [];
  return all
    .filter((p) => {
      if (p.prompt.id === id) return false;
      const other = firstWords(p.prompt.prompt);
      return other !== '' && (other.startsWith(key) || key.startsWith(other));
    })
    .map(
      (p) =>
        `${labelOf(p)} starts with the same words, so Midjourney’s downloads may match both. Start each prompt differently.`,
    );
}

const NO_BOARD = () =>
  new AppError(400, 'no_board', 'A campaign has no images and music board: only an adventure or a one-shot does.');

const UNKNOWN_PROMPT = () =>
  new ToolRefusal(404, 'unknown_prompt', 'No image prompt with that id. get_board lists them.', undefined, 'id');

const unknownScene = (board: DocumentBoard, sceneId: string) => {
  const ids = board.rows.map((r) => r.sceneId);
  return new ToolRefusal(
    404,
    'unknown_scene',
    `The appendix has no row for ${sceneId}. Scenes on the board: ${ids.join(', ') || 'none'}.`,
    { scenes: ids },
    'sceneId',
  );
};

const invalid = (message: string) => new AppError(400, 'invalid_input', message);

const oneLine = z.string().regex(/^[^\r\n]*$/, 'must be one line');

const IMAGE_RULES =
  'Midjourney prompts in English, natural description, most important first: subject, setting, lighting, style, mood; concrete words, no quality tokens (8k, masterpiece); one idea per prompt. ' +
  'Scenes: from the scene’s visual: line, end with `--ar 16:9 --v 8.1`. PCs and NPCs: portraits, end with `--ar 2:3 --v 8.1`. Handouts: the prop in its own ratio, such as a letter `--ar 3:4 --v 8.1` or a map `--ar 4:3 --v 8.1`. ' +
  'Start each image prompt with words no other prompt starts with: the downloads find their prompt by their first words.';

export function registerBoardTools({ tool, projectOf, docOf, write, templates, schemas }: ToolKit): void {
  const { projectId, requiredText, text } = schemas;
  const promptId = requiredText(64).describe('The image prompt’s id as get_board gives it.');
  const sceneId = requiredText(64).describe('The scene’s id as get_board gives it, such as S3.');
  const name = requiredText(LIMITS.name).pipe(oneLine);
  const prompt = requiredText(LIMITS.imagePrompt);

  // The board of a project that can have one.
  const boardable = (project: ProjectRow) => {
    if (project.category === 'campaign') throw NO_BOARD();
    return project;
  };

  // A write on the migrated board.
  const writeBoard = <T>(project: ProjectRow, fn: (doc: Y.Doc) => T) =>
    write(project, (doc) => {
      migrateImagePrompts(doc);
      return fn(doc);
    });

  tool(
    'get_board',
    'The project’s images and music board. Image prompts come in four categories: Scenes (any number per scene of the appendix, with its visual: and mood: lines), PCs, NPCs and Handouts (a name and a prompt each). ' +
      'Each image prompt has its id, number, text, who wrote it and when, status (wanted, received, chosen), image count and chosen file; each scene has its Suno music prompt and status. ' +
      'outsideAppendix lists scene prompts whose scene has no appendix row: kept, not shown. Read it before writing prompts.',
    { title: 'Get the board', readOnly: true, idempotent: true },
    { projectId },
    async (args) => {
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      return boardOut(readDocumentBoard(migratedView(await docOf(project)), extra));
    },
  );

  tool(
    'set_scene_prompts',
    'Write one scene’s first image prompt, its music prompt, or both. Image: one Midjourney prompt in English from the scene’s visual: line, natural description, most important first: subject, setting, lighting, style, mood; concrete words, no quality tokens (8k, masterpiece); one idea per prompt; end with `--ar 16:9 --v 8.1`. It replaces the text of the scene’s prompt 1, creating it when the scene has none; add more shots with add_image_prompt. ' +
      'Music: Suno, in English, from the mood: line. Title: short, unique in the project: Suno names the download after it and the board matches the track by it. Style: 4 to 7 descriptors (genre, tempo, instruments, texture, mood), dark moods stated emphatically. Lyrics: meta tags only for an instrumental ([Intro: …], [Instrumental], [Outro: fade out]), always ending with [End]; instrumental unless the user asks for a sung song. ' +
      'Send image, music or both; the half you leave out is kept. The user can edit any of it by hand.',
    { title: 'Write a scene’s prompts', readOnly: false, idempotent: true },
    {
      projectId,
      sceneId,
      image: z.strictObject({ prompt }).optional(),
      music: z
        .strictObject({
          title: requiredText(LIMITS.trackTitle).pipe(oneLine),
          style: requiredText(LIMITS.style),
          lyrics: text(LIMITS.lyrics),
        })
        .optional(),
    },
    async (args) => {
      if (args.image === undefined && args.music === undefined) throw invalid('Send image, music or both.');
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      return writeBoard(project, (doc: Y.Doc) => {
        const before = readDocumentBoard(doc, extra);
        if (!before.rows.some((r) => r.sceneId === args.sceneId)) throw unknownScene(before, args.sceneId);
        const image = args.image ? setFirstScenePrompt(doc, args.sceneId, args.image.prompt, 'claude') : null;
        if (args.music) setMusicPrompt(doc, args.sceneId, args.music, 'claude');
        const board = readDocumentBoard(doc, extra);
        const written = board.rows.find((r) => r.sceneId === args.sceneId)!;
        const warnings = image ? sharedWords(board, image.id) : [];
        if (args.music && written.duplicateTitle) {
          const key = matchKey(args.music.title);
          const others = board.rows.filter(
            (r) => r.sceneId !== args.sceneId && r.music && matchKey(r.music.title) === key,
          );
          warnings.push(
            `${others.map((r) => r.sceneId).join(', ')} already ${others.length === 1 ? 'has' : 'have'} the track title «${args.music.title}», so Suno’s downloads cannot be matched to their scenes. Give each scene its own title.`,
          );
        }
        return { scene: sceneOut(written), warnings };
      });
    },
  );

  tool(
    'add_image_prompt',
    'Add an image prompt. Scenes: any number per scene of the appendix, each a different shot. PCs, NPCs, Handouts: project-wide, a name and a prompt. ' +
      `${IMAGE_RULES} Read get_board first, so the new prompt does not repeat one that is there.`,
    { title: 'Add an image prompt', readOnly: false, idempotent: false },
    {
      projectId,
      category: z.enum(imageCategories).describe('scene, pc, npc or handout.'),
      sceneId: sceneId.optional().describe('For a scene prompt only: the scene’s id as get_board gives it.'),
      name: name.optional().describe('For a pc, npc or handout prompt only: who or what it shows.'),
      prompt,
    },
    async (args) => {
      if (args.category === 'scene') {
        if (args.sceneId === undefined) throw invalid('A scene prompt needs a sceneId.');
        if (args.name !== undefined) throw invalid('A scene prompt has no name.');
      } else {
        if (args.name === undefined) throw invalid(`A ${args.category} prompt needs a name.`);
        if (args.sceneId !== undefined) throw invalid('Only a scene prompt has a sceneId.');
      }
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      return writeBoard(project, (doc: Y.Doc) => {
        if (args.category === 'scene') {
          const before = readDocumentBoard(doc, extra);
          if (!before.rows.some((r) => r.sceneId === args.sceneId)) throw unknownScene(before, args.sceneId!);
        }
        const added = addImagePrompt(
          doc,
          args.category === 'scene'
            ? { category: 'scene', sceneId: args.sceneId!, prompt: args.prompt }
            : { category: args.category, name: args.name!, prompt: args.prompt },
          'claude',
        );
        const board = readDocumentBoard(doc, extra);
        return {
          prompt: itemOut(allPrompts(board).find((p) => p.prompt.id === added.id)!),
          warnings: sharedWords(board, added.id),
        };
      });
    },
  );

  tool(
    'update_image_prompt',
    `Change an image prompt’s text, its name (PCs, NPCs and handouts only), or both. ${IMAGE_RULES}`,
    { title: 'Change an image prompt', readOnly: false, idempotent: true },
    { projectId, id: promptId, prompt: prompt.optional(), name: name.optional() },
    async (args) => {
      if (args.prompt === undefined && args.name === undefined) throw invalid('Send prompt, name or both.');
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      return writeBoard(project, (doc: Y.Doc) => {
        const found = allPrompts(readDocumentBoard(doc, extra)).find((p) => p.prompt.id === args.id);
        if (!found) throw UNKNOWN_PROMPT();
        if (args.name !== undefined && found.prompt.category === 'scene') throw invalid('A scene prompt has no name.');
        updateImagePrompt(
          doc,
          args.id,
          { ...(args.prompt !== undefined ? { prompt: args.prompt } : {}), ...(args.name !== undefined ? { name: args.name } : {}) },
          'claude',
        );
        const board = readDocumentBoard(doc, extra);
        return {
          prompt: itemOut(allPrompts(board).find((p) => p.prompt.id === args.id)!),
          warnings: args.prompt !== undefined ? sharedWords(board, args.id) : [],
        };
      });
    },
  );

  tool(
    'remove_image_prompt',
    'Remove an image prompt. Its images move to Unmatched; no file is deleted. The prompt’s text is gone for good: prompts are not versioned.',
    { title: 'Remove an image prompt', readOnly: false, idempotent: true, destructive: true },
    { projectId, id: promptId },
    async (args) => {
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      return writeBoard(project, (doc: Y.Doc) => {
        if (!allPrompts(readDocumentBoard(doc, extra)).some((p) => p.prompt.id === args.id)) throw UNKNOWN_PROMPT();
        const { images } = removeImagePrompt(doc, args.id);
        return { removed: args.id, imagesToUnmatched: images };
      });
    },
  );
}
