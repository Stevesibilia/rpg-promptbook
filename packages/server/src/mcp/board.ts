import {
  duplicateTitles,
  LIMITS,
  matchKey,
  readDocumentBoard,
  setFirstScenePrompt,
  setMusicPrompt,
  type BoardRow,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { z } from 'zod';
import { AppError } from '../errors.js';
import type { ProjectRow } from '../projects.js';
import { ToolRefusal } from './errors.js';
import type { ToolKit } from './tools.js';

// The images and music board as two tools (asset-board design decision 15):
// Claude reads which scenes want prompts and writes them one scene at a time.
// Problems in the document never refuse a write, and prompts are not
// versioned, so no snapshot is stored (decision 8).

// Until image categories reach the connector, a scene shows its first prompt
// and the images of all its prompts.
const half = (row: BoardRow) => {
  const first = row.prompts[0]?.prompt;
  const text = first && first.prompt !== '' ? first : null;
  const images = row.prompts.flatMap((p) => p.images).length;
  return {
    image: {
      prompt: text?.prompt ?? null,
      by: text?.by ?? null,
      at: text?.at ?? null,
      status: images === 0 ? 'wanted' : row.prompts[0]?.chosen ? 'chosen' : 'received',
      files: images,
    },
    music: {
      title: row.music?.title ?? null,
      style: row.music?.style ?? null,
      lyrics: row.music?.lyrics ?? null,
      by: row.music?.by ?? null,
      at: row.music?.at ?? null,
      status: row.musicStatus,
      tracks: row.tracks.length,
    },
  };
};

// A row as a model reads it.
const rowOut = (row: BoardRow) => ({
  sceneId: row.sceneId,
  title: row.title,
  visual: row.visual,
  mood: row.mood,
  ...half(row),
});

const NO_BOARD = () =>
  new AppError(400, 'no_board', 'A campaign has no images and music board: only an adventure or a one-shot does.');

const oneLine = z.string().regex(/^[^\r\n]*$/, 'must be one line');

export function registerBoardTools({ tool, projectOf, docOf, write, schemas }: ToolKit): void {
  const { projectId, requiredText, text } = schemas;

  // The board of a project that can have one.
  const boardable = (project: ProjectRow) => {
    if (project.category === 'campaign') throw NO_BOARD();
    return project;
  };

  tool(
    'get_board',
    'The project’s images and music board: one row per scene of the appendix, with its visual: and mood: lines, the Midjourney and Suno prompts, who wrote them and when, and each half’s status (wanted, received, chosen). Read it before writing prompts.',
    { title: 'Get the board', readOnly: true, idempotent: true },
    { projectId },
    async (args) => {
      const project = boardable(await projectOf(args.projectId));
      const { rows, unmatched } = readDocumentBoard(await docOf(project));
      return {
        appendix: rows.length > 0,
        rows: rows.map(rowOut),
        unmatched: unmatched.length,
        duplicateTitles: duplicateTitles(rows),
      };
    },
  );

  tool(
    'set_scene_prompts',
    'Write one scene’s prompts. Image: one Midjourney prompt in English from the scene’s visual: line, natural description, most important first: subject, setting, lighting, style, mood; concrete words, no quality tokens (8k, masterpiece); one idea per prompt; end with `--ar 16:9 --v 8.1`. ' +
      'Music: Suno, in English, from the mood: line. Title: short, unique in the project: Suno names the download after it and the board matches the track by it. Style: 4 to 7 descriptors (genre, tempo, instruments, texture, mood), dark moods stated emphatically. Lyrics: meta tags only for an instrumental ([Intro: …], [Instrumental], [Outro: fade out]), always ending with [End]; instrumental unless the user asks for a sung song. ' +
      'Send image, music or both; the half you leave out is kept. The user can edit any of it by hand.',
    { title: 'Write a scene’s prompts', readOnly: false, idempotent: true },
    {
      projectId,
      sceneId: requiredText(64).describe('The scene’s id as get_board gives it, such as S3.'),
      image: z.strictObject({ prompt: requiredText(LIMITS.imagePrompt) }).optional(),
      music: z
        .strictObject({
          title: requiredText(LIMITS.trackTitle).pipe(oneLine),
          style: requiredText(LIMITS.style),
          lyrics: text(LIMITS.lyrics),
        })
        .optional(),
    },
    async (args) => {
      if (args.image === undefined && args.music === undefined) {
        throw new AppError(400, 'invalid_input', 'Send image, music or both.');
      }
      const project = boardable(await projectOf(args.projectId));
      return write(project, (doc: Y.Doc) => {
        const row = readDocumentBoard(doc).rows.find((r) => r.sceneId === args.sceneId);
        if (!row) {
          const ids = readDocumentBoard(doc).rows.map((r) => r.sceneId);
          throw new ToolRefusal(
            404,
            'unknown_scene',
            `The appendix has no row for ${args.sceneId}. Scenes on the board: ${ids.join(', ') || 'none'}.`,
            { scenes: ids },
            'sceneId',
          );
        }
        if (args.image) setFirstScenePrompt(doc, row.sceneId, args.image.prompt, 'claude');
        if (args.music) setMusicPrompt(doc, row.sceneId, args.music, 'claude');
        const { rows } = readDocumentBoard(doc);
        const written = rows.find((r) => r.sceneId === row.sceneId)!;
        const warnings: string[] = [];
        if (args.music && written.duplicateTitle) {
          const key = matchKey(args.music.title);
          const others = rows.filter((r) => r.sceneId !== row.sceneId && r.music && matchKey(r.music.title) === key);
          warnings.push(
            `${others.map((r) => r.sceneId).join(', ')} already ${others.length === 1 ? 'has' : 'have'} the track title «${args.music.title}», so Suno’s downloads cannot be matched to their scenes. Give each scene its own title.`,
          );
        }
        return { row: rowOut(written), warnings };
      });
    },
  );
}
