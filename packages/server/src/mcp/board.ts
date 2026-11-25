import {
  addFiles,
  addImagePrompt,
  addMusicPrompt,
  CAPS,
  defaultShape,
  duplicateTitles,
  FILE_LIMITS,
  IMAGE_SHAPES,
  imageCategories,
  imageModelKeys,
  LIMITS,
  matchKey,
  MAX_REFERENCES,
  migratedView,
  migrateImagePrompts,
  readDocumentBoard,
  readFiles,
  readGenerationJobs,
  readImagePrompts,
  removeImagePrompt,
  removeMusicPrompt,
  sentPrompt,
  setFirstScenePrompt,
  setMusicPrompt,
  updateImagePrompt,
  updateMusicPrompt,
  type BoardRow,
  type DocumentBoard,
  type GenerationJob,
  type ImageCategory,
  type ImageModelKey,
  type ImageShape,
  type MusicCardRow,
  type NewFile,
  type PromptRow,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { hasRoom, quotaReached } from '../files/store.js';
import { AtelierError, downloadImage } from '../images/atelier.js';
import { atelierRefused, checkImageBytes, storeImage } from '../images/jobs.js';
import { readSecret } from '../images/secrets.js';
import {
  atelierUnavailable,
  labelOf as promptLabel,
  quotaBytesOf,
  serverKeyOf,
  startImageGeneration,
} from '../images/start.js';
import type { ProjectRow } from '../projects.js';
import { getSettings } from '../routes/settings.js';
import { ToolRefusal } from './errors.js';
import type { ToolKit } from './tools.js';

// The images and music board as tools (asset-board design decision 15,
// image-categories design decision 5, general-board-items design decision
// 6): Claude reads which scenes, General items, PCs, NPCs and handouts want
// prompts, writes the music one scene or one General music prompt at a time
// and the image prompts one at a time. Problems in the document never refuse a
// write, and prompts are not versioned, so no snapshot is stored (asset-board
// decision 8). Every write first migrates a board from before image
// categories, in its transaction; get_board reads a migrated view and never
// writes.

const SINGULAR: Record<ImageCategory, string> = { scene: 'Scene', general: 'General', pc: 'PC', npc: 'NPC', handout: 'Handout' };

// «S1 · prompt 2», «NPC · Padre Anselmo».
const labelOf = ({ prompt, number }: PromptRow) =>
  prompt.category === 'scene' ? `${prompt.sceneId} · prompt ${number}` : `${SINGULAR[prompt.category]} · ${prompt.name}`;

// The generation jobs a board is read with: the running ones, and the
// finished ones with an error (readGenerationJobs), oldest first.
type Jobs = readonly GenerationJob[];

// An image prompt as a model reads it. `generating` and `generationError`
// come from its jobs (connector-board-images design decision 11).
const itemOut = (row: PromptRow, jobs: Jobs) => {
  const { prompt } = row;
  const text = prompt.prompt !== '';
  const own = jobs.filter((j) => j.promptId === prompt.id);
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
    // reference-images design decision 19: its images by id, and the ids
    // of its reference images.
    images: row.images.map((f) => ({ id: f.id, name: f.name, chosen: f.id === row.chosen, generated: f.generatedModel !== null })),
    references: prompt.references,
    generating: own.some((j) => j.finishedAt === null),
    generationError: own.filter((j) => j.finishedAt !== null && j.error !== null).at(-1)?.error ?? null,
  };
};

// A scene as a model reads it.
const sceneOut = (row: BoardRow, jobs: Jobs) => ({
  sceneId: row.sceneId,
  title: row.title,
  visual: row.visual,
  mood: row.mood,
  images: row.prompts.map((p) => itemOut(p, jobs)),
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

// A General music prompt as a model reads it.
const musicOut = ({ prompt, tracks, status }: MusicCardRow) => ({
  id: prompt.id,
  title: prompt.title,
  style: prompt.style,
  lyrics: prompt.lyrics,
  by: prompt.by,
  at: prompt.at !== '' ? prompt.at : null,
  status,
  tracks: tracks.length,
  chosen: tracks.find((f) => f.id === prompt.chosenTrack)?.name ?? null,
});

const boardTitles = (board: DocumentBoard) =>
  duplicateTitles(
    board.rows,
    board.music.map((m) => m.prompt),
  );

const boardOut = (board: DocumentBoard, jobs: Jobs) => ({
  appendix: board.rows.length > 0,
  scenes: board.rows.map((r) => sceneOut(r, jobs)),
  general: {
    images: board.named.general.map((p) => itemOut(p, jobs)),
    music: board.music.map(musicOut),
  },
  pcs: board.named.pc.map((p) => itemOut(p, jobs)),
  npcs: board.named.npc.map((p) => itemOut(p, jobs)),
  handouts: board.named.handout.map((p) => itemOut(p, jobs)),
  outsideAppendix: board.outsideAppendix.map((p) => itemOut(p, jobs)),
  unmatched: board.unmatched.length,
  duplicateTitles: boardTitles(board),
});

// The prompts the board shows: those of the appendix's scenes, the General
// images, the PCs, the NPCs and the handouts.
const shownPrompts = (board: DocumentBoard): PromptRow[] => [
  ...board.rows.flatMap((row) => row.prompts),
  ...board.named.general,
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

// The scenes and General music prompts other than `own` whose music title
// is `title`, compared as tracks are matched; a warning naming them, or null.
function sharedTitle(board: DocumentBoard, title: string, own: { sceneId: string } | { musicId: string }): string | null {
  const key = matchKey(title);
  if (key === '') return null;
  const scenes = board.rows
    .filter((r) => !('sceneId' in own && r.sceneId === own.sceneId) && r.music && matchKey(r.music.title) === key)
    .map((r) => r.sceneId);
  const general = board.music
    .filter((m) => !('musicId' in own && m.prompt.id === own.musicId) && matchKey(m.prompt.title) === key)
    .map((m) => `General «${m.prompt.title}»`);
  const others = [...scenes, ...general];
  if (others.length === 0) return null;
  return `${others.join(', ')} already ${others.length === 1 ? 'has' : 'have'} the track title «${title}», so Suno’s downloads cannot be matched to their music prompts. Give each scene and each General music prompt its own title.`;
}

const NO_BOARD = () =>
  new AppError(400, 'no_board', 'A campaign has no images and music board: only an adventure or a one-shot does.');

const UNKNOWN_MUSIC = () =>
  new ToolRefusal(404, 'unknown_music', 'No General music prompt with that id. get_board lists them.', undefined, 'musicId');

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
  'Scenes: from the scene’s visual: line, end with `--ar 16:9 --v 8.1`. General: images of the whole adventure, in the image’s own ratio: `--ar 16:9 --v 8.1` for an establishing shot, `--ar 2:3 --v 8.1` for a cover. PCs and NPCs: portraits, end with `--ar 2:3 --v 8.1`. Handouts: the prop in its own ratio, such as a letter `--ar 3:4 --v 8.1` or a map `--ar 4:3 --v 8.1`. ' +
  'Start each image prompt with words no other prompt starts with: the downloads find their prompt by their first words.';

// Suno's rules, shared by the scene music and the General music prompts.
const SUNO_RULES =
  'Suno, in English. Title: short, unique in the project, scenes and General music together: Suno names the download after it and the board matches the track by it. Style: 4 to 7 descriptors (genre, tempo, instruments, texture, mood), dark moods stated emphatically. Lyrics: meta tags only for an instrumental ([Intro: …], [Instrumental], [Outro: fade out]), always ending with [End]; instrumental unless the user asks for a sung song.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// connector-board-images design decision 10: what the image tools refuse.
const NO_ATELIER_TOKEN = () =>
  new AppError(409, 'no_atelier_token', 'Add your Atelier API token in Promptbook’s Settings first.');
const UNSUPPORTED_TYPE = () => new AppError(415, 'unsupported_type', 'That Atelier file is not a PNG, JPEG or WebP image.');
const BOARD_FULL = () => new AppError(409, 'board_full', 'The board is full.');
const MUSIC_FULL = () =>
  new AppError(409, 'board_full', `The board holds ${CAPS.musicPrompts} General music prompts, the most it takes.`);

// The server's own refusals a model can act on, at 409: toToolError hides
// anything at 500 or above behind internal_error.
const LEGIBLE = new Set(['not_configured', 'atelier_unavailable', 'quota']);

function legible(error: unknown): unknown {
  if (error instanceof AppError && error.status >= 500 && LEGIBLE.has(error.code)) {
    return new AppError(409, error.code, error.message);
  }
  return error;
}

// Atelier's answer to a download, in words a model can act on. The token is
// in none of them: the Atelier client puts it in no error.
function fromAtelier(error: unknown): unknown {
  if (!(error instanceof AtelierError)) return error;
  if (error.status === 404) return new AppError(404, 'atelier_image_not_found', 'Atelier has no image with this id.');
  if (error.status === 401) {
    return new AppError(409, 'token_rejected', 'Atelier rejected the saved token. Replace it in Settings.');
  }
  // No answer, one that cannot be read, or a refusal Atelier did not word:
  // atelier_unreachable, atelier_bad_answer, atelier_refused, as they are.
  const refused = atelierRefused(error);
  if (refused === null) return new AppError(424, error.code, error.message);
  return new AppError(424, 'atelier_refused', refused);
}

export function registerBoardTools({ tool, projectOf, docOf, write, templates, caller, starter, schemas }: ToolKit): void {
  const { projectId, requiredText, text } = schemas;
  const promptId = requiredText(64).describe('The image prompt’s id as get_board gives it.');
  const sceneId = requiredText(64).describe('The scene’s id as get_board gives it, such as S3.');
  const name = requiredText(LIMITS.name).pipe(oneLine);
  const prompt = requiredText(LIMITS.imagePrompt);
  const musicId = requiredText(64).describe('The General music prompt’s id as get_board gives it.');
  const musicTitle = requiredText(LIMITS.trackTitle).pipe(oneLine);
  const musicStyle = requiredText(LIMITS.style);
  const musicLyrics = text(LIMITS.lyrics);

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
    'The project’s images and music board. Image prompts come in five categories: Scenes (any number per scene of the appendix, with its visual: and mood: lines), General (images of the whole adventure, under general.images), PCs, NPCs and Handouts (a name and a prompt each). ' +
      'Each image prompt has its id, number, text, who wrote it and when, status (wanted, received, chosen), image count and chosen file; each scene has its Suno music prompt and status; general.music lists the General music prompts (a main theme, combat, ambience), each with its id, title, style, lyrics, who wrote it and when, status, track count and chosen track. ' +
      'outsideAppendix lists scene prompts whose scene has no appendix row: kept, not shown. duplicateTitles lists the music titles used twice, in scenes or General. Read it before writing prompts.',
    { title: 'Get the board', readOnly: true, idempotent: true },
    { projectId },
    async (args) => {
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      const doc = migratedView(await docOf(project));
      return boardOut(readDocumentBoard(doc, extra), readGenerationJobs(doc));
    },
  );

  tool(
    'set_scene_prompts',
    'Write one scene’s first image prompt, its music prompt, or both. Image: one Midjourney prompt in English from the scene’s visual: line, natural description, most important first: subject, setting, lighting, style, mood; concrete words, no quality tokens (8k, masterpiece); one idea per prompt; end with `--ar 16:9 --v 8.1`. It replaces the text of the scene’s prompt 1, creating it when the scene has none; add more shots with add_image_prompt. ' +
      `Music: from the mood: line. ${SUNO_RULES} ` +
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
        const shared = args.music ? sharedTitle(board, args.music.title, { sceneId: args.sceneId }) : null;
        if (shared !== null) warnings.push(shared);
        return { scene: sceneOut(written, readGenerationJobs(doc)), warnings };
      });
    },
  );

  tool(
    'add_image_prompt',
    'Add an image prompt. Scenes: any number per scene of the appendix, each a different shot. General (images of the whole adventure: establishing shots, a cover), PCs, NPCs, Handouts: project-wide, a name and a prompt. ' +
      `${IMAGE_RULES} Read get_board first, so the new prompt does not repeat one that is there.`,
    { title: 'Add an image prompt', readOnly: false, idempotent: false },
    {
      projectId,
      category: z.enum(imageCategories).describe('scene, general, pc, npc or handout.'),
      sceneId: sceneId.optional().describe('For a scene prompt only: the scene’s id as get_board gives it.'),
      name: name.optional().describe('For a general, pc, npc or handout prompt only: who or what it shows.'),
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
          prompt: itemOut(allPrompts(board).find((p) => p.prompt.id === added.id)!, readGenerationJobs(doc)),
          warnings: sharedWords(board, added.id),
        };
      });
    },
  );

  tool(
    'update_image_prompt',
    `Change an image prompt’s text, its name (General images, PCs, NPCs and handouts only), or both. ${IMAGE_RULES}`,
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
          prompt: itemOut(allPrompts(board).find((p) => p.prompt.id === args.id)!, readGenerationJobs(doc)),
          warnings: args.prompt !== undefined ? sharedWords(board, args.id) : [],
        };
      });
    },
  );

  tool(
    'generate_image',
    'Generate 1 to 4 images on an image prompt, through the image provider the user chose in Settings (Atelier or OpenRouter), as the board’s Generate button does. This spends the user’s money: generate when the user asks for images, not to try a prompt out. Model, count and shape default to the user’s settings and the prompt’s own ratio. The call waits up to waitSeconds for the images; when it answers state running, read get_board later: the prompt says generating until the job ends, then its files count has grown or generationError says why not. The images land on the prompt as received. To keep a character or a place the same, pass up to 3 reference images in references: image ids from get_board (each prompt’s images[].id, any prompt of this project); a list you pass is remembered on the prompt and sent again when references is left out.',
    { title: 'Generate images', readOnly: false, idempotent: false, openWorld: true },
    {
      projectId,
      promptId,
      model: z.enum(imageModelKeys).optional().describe('gpt (GPT Image) or nb (Nano Banana); the user’s setting when left out.'),
      count: z.number().int().min(1).max(4).optional().describe('1 to 4 images; the user’s setting when left out.'),
      shape: z
        .enum(IMAGE_SHAPES)
        .optional()
        .describe('16:9, 3:2, 1:1 or 2:3; from the prompt’s --ar, or its category’s default, when left out.'),
      waitSeconds: z.number().min(0).max(50).optional().describe('How long to wait for the images, 0 to 50 seconds; 45 when left out.'),
      references: z
        .array(z.string().min(1).max(200))
        .max(MAX_REFERENCES)
        .optional()
        .describe(
          'Up to 3 reference images, to keep a face or a place the same: ids from the images of any prompt in get_board (images[].id), in this project. Left out, the prompt’s own references (references in get_board) are sent. Given, also an empty list, they are sent and remembered on the prompt.',
        ),
    },
    async (args) => {
      try {
        return await generate(args);
      } catch (error) {
        throw legible(error);
      }
    },
  );

  // connector-board-images design decisions 3 and 4: the panel's defaults,
  // the shared start, a wait that never stops the job, then what arrived.
  async function generate(args: {
    projectId: string;
    promptId: string;
    model?: ImageModelKey | undefined;
    count?: number | undefined;
    shape?: ImageShape | undefined;
    waitSeconds?: number | undefined;
    references?: string[] | undefined;
  }) {
    const project = boardable(await projectOf(args.projectId));
    const prompt = readImagePrompts(migratedView(await docOf(project))).find((p) => p.id === args.promptId);
    if (!prompt) throw UNKNOWN_PROMPT();
    const settings = (await getSettings(starter.db, caller.userId)).imageGeneration;
    const model = args.model ?? settings.model;
    const count = args.count ?? settings.count;
    const shape = args.shape ?? defaultShape(prompt.category, sentPrompt(prompt.prompt).ar).shape;
    const started = await startImageGeneration(starter, {
      userId: caller.userId,
      projectId: project.id,
      promptId: args.promptId,
      model,
      count,
      shape,
      references: args.references ?? null,
      addedBy: 'claude',
    });
    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), (args.waitSeconds ?? 45) * 1000)));
    const finished = await Promise.race([started.done.then(() => true), waited]);
    clearTimeout(timer);
    const doc = await docOf(project);
    const since = Date.parse(started.startedAt);
    const images = readFiles(doc)
      .filter((f) => f.promptId === args.promptId && f.generatedModel !== null && Date.parse(f.addedAt) >= since)
      .map((f) => ({ name: f.name, width: f.width, height: f.height, cost: f.cost, atelierImageId: f.atelierImageId }));
    // A job that ended without an error is gone from the document.
    const job = readGenerationJobs(doc).find((j) => j.id === started.jobId);
    return {
      jobId: started.jobId,
      promptId: args.promptId,
      provider: started.provider,
      model,
      count,
      shape,
      references: started.references,
      state: finished ? 'finished' : 'running',
      images,
      failed: job?.failed ?? 0,
      error: job?.error ?? null,
    };
  }

  tool(
    'attach_atelier_image',
    'Put an image that is already in the user’s Atelier on an image prompt, by the image’s id (as Atelier’s own tools give it). Promptbook downloads the original itself with the Atelier token saved in Settings; the bytes never pass through this conversation. It costs nothing. Use it for images made in Atelier outside Promptbook; to make new ones, use generate_image.',
    { title: 'Attach an Atelier image', readOnly: false, idempotent: true },
    {
      projectId,
      promptId,
      atelierImageId: z
        .string()
        .trim()
        .regex(UUID, 'must be a uuid')
        .describe('The Atelier image’s id, a uuid, as Atelier’s own tools give it.'),
    },
    async (args) => {
      try {
        return await attach(args.projectId, args.promptId, args.atelierImageId.toLowerCase());
      } catch (error) {
        throw legible(error);
      }
    },
  );

  // connector-board-images design decision 6: every refusal that can be
  // known before the download comes before it, and the board is written
  // last, so a refusal changes nothing on it.
  async function attach(id: string, promptIdArg: string, atelierImageId: string) {
    const project = boardable(await projectOf(id));
    const known = readImagePrompts(migratedView(await docOf(project)));
    if (!known.some((p) => p.id === promptIdArg)) throw UNKNOWN_PROMPT();
    const { config, db, blobs } = starter;
    const sealing = serverKeyOf(config);
    if (config.atelierUrl === null) throw atelierUnavailable();
    const stored = await readSecret(db, sealing, caller.userId, 'atelier');
    if (stored.state !== 'ok') throw NO_ATELIER_TOKEN();
    const quotaBytes = quotaBytesOf(config);
    // Room for the largest image Atelier may send.
    if (!(await hasRoom(db, caller.userId, FILE_LIMITS.image, quotaBytes))) throw quotaReached();
    let bytes: Buffer;
    try {
      bytes = await downloadImage(config.atelierUrl, stored.key, atelierImageId);
    } catch (error) {
      throw fromAtelier(error);
    }
    const image = checkImageBytes(bytes);
    if (!image) throw UNSUPPORTED_TYPE();
    const size = await storeImage({ db, blobs, quotaBytes }, { projectId: project.id, userId: caller.userId }, bytes, image);
    return writeBoard(project, (doc: Y.Doc) => {
      const prompts = readImagePrompts(doc);
      const prompt = prompts.find((p) => p.id === promptIdArg);
      // Removed while the image was downloaded.
      if (!prompt) throw UNKNOWN_PROMPT();
      const entry: NewFile = {
        sha256: image.sha256,
        thumbSha256: null,
        name: `${promptLabel(prompt, prompts)}-atelier-${atelierImageId.slice(0, 8)}.${image.ext}`,
        kind: 'image',
        mime: image.mime,
        size: bytes.length,
        width: size?.width ?? null,
        height: size?.height ?? null,
        duration: null,
        sceneId: null,
        promptId: promptIdArg,
        matchedBy: 'hand',
        addedBy: 'claude',
        generatedModel: null,
        cost: null,
        generatedVia: null,
        atelierImageId,
      };
      let already: boolean;
      try {
        already = addFiles(doc, [entry]).skipped.length > 0;
      } catch (error) {
        // The project's cap on files.
        if (error instanceof Error && error.message.startsWith('files: at most')) throw BOARD_FULL();
        throw error;
      }
      const file = readFiles(doc).find((f) => f.sha256 === image.sha256)!;
      return {
        promptId: promptIdArg,
        atelierImageId,
        file: { name: file.name, mime: file.mime, size: file.size, width: file.width, height: file.height },
        already,
      };
    });
  }

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

  // General music prompts (general-board-items design decision 6).
  const musicCard = (board: DocumentBoard, id: string) => musicOut(board.music.find((m) => m.prompt.id === id)!);

  tool(
    'add_music_prompt',
    'Add a General music prompt: a Suno prompt for the whole adventure, not tied to a scene, such as a main theme, combat music or ambience. Any number per adventure or one-shot; a scene’s own music is written with set_scene_prompts. ' +
      `${SUNO_RULES} Read get_board first, so the new prompt does not repeat one that is there.`,
    { title: 'Add a music prompt', readOnly: false, idempotent: false },
    { projectId, title: musicTitle, style: musicStyle, lyrics: musicLyrics },
    async (args) => {
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      return writeBoard(project, (doc: Y.Doc) => {
        if (readDocumentBoard(doc, extra).music.length >= CAPS.musicPrompts) throw MUSIC_FULL();
        const added = addMusicPrompt(doc, { title: args.title, style: args.style, lyrics: args.lyrics }, 'claude');
        const board = readDocumentBoard(doc, extra);
        const shared = sharedTitle(board, args.title, { musicId: added.id });
        return { music: musicCard(board, added.id), warnings: shared === null ? [] : [shared] };
      });
    },
  );

  tool(
    'update_music_prompt',
    `Change a General music prompt’s title, style, lyrics or several; the parts you leave out are kept. ${SUNO_RULES}`,
    { title: 'Change a music prompt', readOnly: false, idempotent: true },
    {
      projectId,
      musicId,
      title: musicTitle.optional(),
      style: musicStyle.optional(),
      lyrics: musicLyrics.optional(),
    },
    async (args) => {
      if (args.title === undefined && args.style === undefined && args.lyrics === undefined) {
        throw invalid('Send title, style, lyrics or several.');
      }
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      return writeBoard(project, (doc: Y.Doc) => {
        if (!readDocumentBoard(doc, extra).music.some((m) => m.prompt.id === args.musicId)) throw UNKNOWN_MUSIC();
        updateMusicPrompt(
          doc,
          args.musicId,
          {
            ...(args.title !== undefined ? { title: args.title } : {}),
            ...(args.style !== undefined ? { style: args.style } : {}),
            ...(args.lyrics !== undefined ? { lyrics: args.lyrics } : {}),
          },
          'claude',
        );
        const board = readDocumentBoard(doc, extra);
        const card = musicCard(board, args.musicId);
        const shared = args.title !== undefined ? sharedTitle(board, card.title, { musicId: args.musicId }) : null;
        return { music: card, warnings: shared === null ? [] : [shared] };
      });
    },
  );

  tool(
    'remove_music_prompt',
    'Remove a General music prompt. Its tracks move to Unmatched; no file is deleted. The prompt’s text is gone for good: prompts are not versioned.',
    { title: 'Remove a music prompt', readOnly: false, idempotent: true, destructive: true },
    { projectId, musicId },
    async (args) => {
      const project = boardable(await projectOf(args.projectId));
      const extra = await templates();
      return writeBoard(project, (doc: Y.Doc) => {
        if (!readDocumentBoard(doc, extra).music.some((m) => m.prompt.id === args.musicId)) throw UNKNOWN_MUSIC();
        const { tracks } = removeMusicPrompt(doc, args.musicId);
        return { removed: args.musicId, tracksToUnmatched: tracks };
      });
    },
  );
}
