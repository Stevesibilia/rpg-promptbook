import type { ImageCategory } from './board.js';

// Image generation through OpenRouter (board-image-generation design
// decisions 4 to 6): the models, the text a prompt sends and the shapes.
// Shared by the server, which calls OpenRouter, and the web panel, which shows
// what is sent.

export const IMAGE_MODELS = {
  gpt: {
    id: 'openai/gpt-image-2.6-sunburst',
    name: 'GPT Image 2.6',
    full: 'GPT Image 2.6 Sunburst',
    note: 'Best detail and text',
    estimate: 0.04,
    seconds: 53,
  },
  nb: {
    id: 'google/gemini-nano-banana-2.1',
    name: 'Nano Banana 2.1',
    full: 'Nano Banana 2.1',
    note: 'Fast draft',
    estimate: 0.037,
    seconds: 17,
  },
} as const;

export type ImageModelKey = keyof typeof IMAGE_MODELS;
export const imageModelKeys = ['gpt', 'nb'] as const satisfies readonly ImageModelKey[];

export const isImageModelKey = (value: unknown): value is ImageModelKey =>
  typeof value === 'string' && (imageModelKeys as readonly string[]).includes(value);

// What a prompt sends (D5): the text before the first Midjourney flag, with
// `--no …` turned into a sentence; every other flag is left out.
export interface SentPrompt {
  // What OpenRouter gets.
  text: string;
  // The text before the first flag, trimmed.
  base: string;
  // The flags as written, '' when none.
  flags: string;
  // The --no list as sent: "text, letters or modern buildings".
  no: string | null;
  // The --ar value as written: "3:2".
  ar: string | null;
}

const FIRST_FLAG = /\s--[a-z]/;
const AR = /--ar\s+(\d+:\d+)/;
const NO = /(?:^|\s)--no(?:\s+(?!--[a-z])(.*?))?(?=\s--[a-z]|$)/s;

export function sentPrompt(input: string): SentPrompt {
  const at = FIRST_FLAG.exec(input);
  if (!at) return { text: input.trim(), base: input.trim(), flags: '', no: null, ar: null };
  const base = input.slice(0, at.index).trim();
  const flags = input.slice(at.index).trim();
  const ar = AR.exec(flags)?.[1] ?? null;
  const list = (NO.exec(flags)?.[1] ?? '').trim().replace(/[.\s]+$/, '');
  const no = list === '' ? null : list.replace(/,\s+(?!.*,\s)/s, ' or ');
  const text = no === null ? base : `${base.replace(/[.\s]+$/, '')}. No ${no}.`;
  return { text, base, flags, no, ar };
}

// The shapes both models take (D6), and the one a prompt starts from.
export const IMAGE_SHAPES = ['16:9', '3:2', '1:1', '2:3'] as const;
export type ImageShape = (typeof IMAGE_SHAPES)[number];

export const isImageShape = (value: unknown): value is ImageShape =>
  typeof value === 'string' && (IMAGE_SHAPES as readonly string[]).includes(value);

export type ShapeSource = 'prompt' | 'nearest' | 'category';

const categoryShapes: Record<ImageCategory, ImageShape> = {
  scene: '16:9',
  pc: '2:3',
  npc: '2:3',
  handout: '1:1',
};

const RATIO = /^(\d+):(\d+)$/;

const logRatio = (shape: string): number => {
  const [w, h] = shape.split(':').map(Number) as [number, number];
  return Math.log(w / h);
};

// The prompt's --ar when it is an allowed shape; else, for a well-formed
// w:h, the allowed shape nearest by ratio (the first on a tie); else the
// category's.
export function defaultShape(category: ImageCategory, ar: string | null): { shape: ImageShape; source: ShapeSource } {
  if (isImageShape(ar)) return { shape: ar, source: 'prompt' };
  const match = ar === null ? null : RATIO.exec(ar);
  if (match && Number(match[1]) > 0 && Number(match[2]) > 0) {
    const wanted = Math.log(Number(match[1]) / Number(match[2]));
    let best: ImageShape = IMAGE_SHAPES[0];
    for (const shape of IMAGE_SHAPES) {
      if (Math.abs(wanted - logRatio(shape)) < Math.abs(wanted - logRatio(best))) best = shape;
    }
    return { shape: best, source: 'nearest' };
  }
  return { shape: categoryShapes[category] ?? '1:1', source: 'category' };
}
