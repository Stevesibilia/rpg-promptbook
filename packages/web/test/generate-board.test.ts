import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { FileEntry, GenerationJob, ImagePromptEntry, PromptRow } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { ImageGenerationStatus } from '../src/api.js';
import { BoardContext, type BoardContextValue, type Generation } from '../src/board/context.js';
import { GeneratedBadge, GeneratedHere } from '../src/board/GeneratePanel.js';
import { PromptBody } from '../src/board/ImagePrompt.js';
import { OfflineNotice } from '../src/board/parts.js';
import type { ShownPrompt } from '../src/board/summary.js';
import type { PendingStart, StatusState } from '../src/board/useGeneration.js';

// Generate on the board as it is drawn (board-image-generation «The approved
// screens», screens 2, 3, 6, 7, 8 and 9): the button, the panel and its
// no-key and not-configured states, the progress and the error line.

const MJ = 'Low-angle view of a flooded crypt, sepia and ash palette --ar 3:2 --v 8.1 --no text, letters, modern buildings';

const entry = (patch: Partial<ImagePromptEntry> = {}): ImagePromptEntry => ({
  id: 'p1',
  category: 'scene',
  sceneId: 'S2',
  name: null,
  prompt: MJ,
  by: 'claude',
  at: '',
  order: 0,
  chosenFileId: null,
  ...patch,
});

const shown = (patch: Partial<ImagePromptEntry> = {}, images: FileEntry[] = []): ShownPrompt => ({
  row: { prompt: entry(patch), number: 1, images, chosen: null, status: images.length ? 'received' : 'wanted' } as PromptRow,
  scene: { sceneId: 'S2', title: 'La cripta' },
});

const ready = (patch: Partial<ImageGenerationStatus> = {}): StatusState => ({
  state: 'ready',
  status: {
    configured: true,
    key: { hint: 'a41f', checkedAt: '2026-11-11T21:40:00.000Z', limitRemaining: null },
    spending: { month: { images: 0, cost: 0 }, all: { images: 0, cost: 0 }, projects: [] },
    provider: 'openrouter',
    atelier: { available: true, url: 'http://atelier.test', token: null },
    ...patch,
  },
});

const job = (patch: Partial<GenerationJob> = {}): GenerationJob => ({
  id: 'j1',
  promptId: 'p1',
  model: 'gpt',
  provider: 'openrouter',
  count: 4,
  done: 1,
  failed: 0,
  startedAt: new Date(Date.now() - 47_000).toISOString(),
  by: 'u1',
  error: null,
  finishedAt: null,
  ...patch,
});

function render(prompt: ShownPrompt, gen: Partial<Generation> = {}, part?: ReactElement): string {
  const generation: Generation = {
    user: 'u1',
    offline: false,
    status: ready(),
    retryStatus: () => {},
    checkStatus: () => {},
    projectTitle: "L'Ancora di Sabaoth",
    defaults: { model: 'gpt', count: 2 },
    jobs: new Map(),
    pending: new Map(),
    shapes: new Map(),
    start: async () => null,
    spending: null,
    spendingTitle: 'Generated in this project, as billed by OpenRouter',
    open: null,
    setOpen: () => {},
    ...gen,
  };
  const value = {
    doc: new Y.Doc(),
    projectId: 'proj',
    rows: [],
    named: { pc: [], npc: [], handout: [] },
    shown: new Map([[prompt.row.prompt.id, prompt]]),
    marks: new Set<string>(),
    toast: () => {},
    openViewer: () => {},
    mark: () => {},
    editing: new Set<string>(),
    setEditing: () => {},
    adding: null,
    setAdding: () => {},
    generation,
  } as unknown as BoardContextValue;
  const tree: ReactElement = createElement(
    MemoryRouter,
    null,
    createElement(BoardContext.Provider, { value }, part ?? createElement(PromptBody, { prompt })),
  );
  return renderToStaticMarkup(tree);
}

// The markup as text, tags dropped.
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

describe('Generate on a prompt', () => {
  it('sits after Copy and Edit, the panel closed', () => {
    const html = render(shown());
    expect(text(html)).toMatch(/Copy Edit Generate No images yet\. Generate them, or drop downloaded files here\./);
    expect(html).toMatch(/<button class="tb sm gen" aria-expanded="false" aria-haspopup="dialog">/);
  });

  it('is not offered on a prompt with no text', () => {
    expect(text(render(shown({ prompt: '' })))).not.toMatch(/Generate/);
  });

  it('opens the panel: models, images, shape from the --ar, what is sent, the price', () => {
    const html = render(shown(), { open: 'p1' });
    expect(html).toMatch(/role="dialog" aria-label="Generate images"/);
    expect(html).toMatch(/aria-expanded="true"/);
    const t = text(html);
    expect(t).toMatch(
      /Generate images ✕ Through OpenRouter · billed to your OpenRouter key Change Model GPT Image 2\.6 Best detail and text ≈ \$0\.04 · 53 s per image Nano Banana 2\.1 Fast draft ≈ \$0\.04 · 17 s per image/,
    );
    expect(t).toMatch(/Images 1 2 3 4 Shape from the prompt's --ar 16:9 3:2 1:1 2:3/);
    expect(html).toMatch(/from the prompt&#x27;s <code class="flag">--ar<\/code>/);
    expect(html).toMatch(/<button class="on" aria-pressed="true">3:2<\/button>/);
    expect(html).toMatch(/<button class="on" aria-pressed="true">2<\/button>/);
    expect(html).toMatch(/<details open="">/);
    expect(t).toMatch(/What is sent: Midjourney flags left out Low-angle view of a flooded crypt, sepia and ash palette No text, letters or modern buildings\. --ar 3:2/);
    expect(html).toMatch(/<ins>No text, letters or modern buildings\.<\/ins>/);
    expect(html).toMatch(/<s>--ar 3:2 --v 8\.1 --no text, letters, modern buildings<\/s>/);
    expect(t).toMatch(/About \$0\.08 · 1K Cancel Generate 2 No images yet/);
  });

  it('starts from the defaults for a card, with its category shape', () => {
    const named: ShownPrompt = { ...shown({ category: 'npc', sceneId: null, name: 'Padre Anselmo', prompt: 'an old priest' }), scene: null };
    const t = text(render(named, { open: 'p1', defaults: { model: 'nb', count: 3 } }));
    expect(t).toMatch(/Shape default for NPCs/);
    expect(t).toMatch(/What is sent an old priest About \$0\.11 · 1K Cancel Generate 3 No images yet/);
  });

  it('asks for a key first, or says the server is not set up', () => {
    const nokey = render(shown(), { open: 'p1', status: ready({ key: null }) });
    expect(text(nokey)).toMatch(
      /Generate images ✕ Add your OpenRouter key first\. Images are billed to your OpenRouter account\. Open Settings → Image generation No images yet/,
    );
    expect(nokey).toMatch(/href="\/settings\/image-generation"/);
    const off = text(render(shown(), { open: 'p1', status: ready({ configured: false, key: null }) }));
    expect(off).toMatch(/Generate images ✕ This server is not set up for image generation\. No images yet/);
  });

  it('shows a running job: a slot per image to come, the line, Generate disabled', () => {
    const html = render(shown(), { jobs: new Map([['p1', job()]]) });
    expect(html.match(/class="slot-g"/g)).toHaveLength(3);
    expect(html).toMatch(/aspect-ratio:3 \/ 2/);
    expect(text(html)).toMatch(/Generating 2 of 4 with GPT Image 2\.6 through OpenRouter · 4[78]s\. It keeps going if you leave this page\./);
    expect(html).toMatch(/<button class="tb sm gen" disabled="" title="Generating…"/);
    expect(text(html)).not.toMatch(/No images yet/);
  });

  it('puts the model and cost on a generated thumbnail', () => {
    // Generated before Atelier came: no generatedVia, read as OpenRouter's.
    const file = { generatedModel: 'gpt', cost: 0.041 } as FileEntry;
    expect(renderToStaticMarkup(createElement(GeneratedBadge, { file }))).toBe(
      '<span class="gen-at"><span class="badge gen gpt" title="GPT Image 2.6 Sunburst through OpenRouter, $0.041"><span class="gen-full">GPT · $0.04</span><span class="gen-short">$0.04</span></span></span>',
    );
    const atelier = { generatedModel: 'gpt', generatedVia: 'atelier', cost: 0.081 } as FileEntry;
    expect(renderToStaticMarkup(createElement(GeneratedBadge, { file: atelier }))).toMatch(
      /title="GPT Image 2\.6 Sunburst through Atelier, \$0\.081"><span class="gen-full">GPT · \$0\.08<\/span>/,
    );
    expect(renderToStaticMarkup(createElement(GeneratedBadge, { file: { generatedModel: null, cost: null } as FileEntry }))).toBe('');
  });

  it('shows a start the server took at once, in the shape chosen here', () => {
    const pending: PendingStart = { model: 'nb', provider: 'atelier', count: 2, since: new Date().toISOString(), jobId: 'j9' };
    const html = render(shown(), { pending: new Map([['p1', pending]]), shapes: new Map([['j9', '1:1']]) });
    expect(html.match(/class="slot-g" style="aspect-ratio:1 \/ 1"/g)).toHaveLength(2);
    expect(text(html)).toMatch(/Generating 1 of 2 with Nano Banana 2\.1 through Atelier · 0s\./);
  });

  it('shows an error in place of the empty line, with Try again and dismiss', () => {
    const failed = job({
      done: 0,
      failed: 2,
      error: 'OpenRouter refused: your key has no credit left. Add credit on openrouter.ai, then try again. Nothing was charged.',
      finishedAt: new Date().toISOString(),
    });
    const html = render(shown(), { jobs: new Map([['p1', failed]]) });
    expect(html).toMatch(/class="info err" role="alert"/);
    expect(html).toMatch(/<b>OpenRouter refused: your key has no credit left\.<\/b>/);
    expect(text(html)).toMatch(/Add credit on openrouter\.ai, then try again\. Nothing was charged\. Try again ✕$/);
    expect(text(html)).not.toMatch(/No images yet/);
    // Generate is free again.
    expect(html).toMatch(/<button class="tb sm gen" aria-expanded="false"/);
  });
});

// atelier-image-provider D13, mockup screens 2, 5 and 7.
describe('Generate through Atelier', () => {
  const token = {
    hint: '7c1d',
    checkedAt: '2026-11-12T21:40:00.000Z',
    name: 'promptbook',
    expiresAt: null,
    month: { spent: 0.9, cap: 20 },
    estimates: { gpt: 0.083, nb: 0.037 },
  };
  const atelier = (patch: Partial<ImageGenerationStatus['atelier']> = {}) =>
    ready({ provider: 'atelier', atelier: { available: true, url: 'https://atelier.siberio.eu', token, ...patch } });

  it('screen 2: the Through line with the collection and the month, and Atelier’s estimates', () => {
    const html = render(shown(), { open: 'p1', status: atelier() });
    const t = text(html);
    expect(t).toMatch(
      /Generate images ✕ Through Atelier · into the collection «L'Ancora di Sabaoth» · \$0\.90 of \$20 used this month Change Model GPT Image 2\.6 Best detail and text ≈ \$0\.08 · 53 s per image Nano Banana 2\.1 Fast draft ≈ \$0\.04 · 17 s per image/,
    );
    expect(html).toMatch(/<div class="via">Through <b>Atelier<\/b>.*<a class="lnk" href="\/settings\/image-generation"[^>]*>Change<\/a><\/div>/);
    // GPT at Atelier's $0.083, twice.
    expect(t).toMatch(/About \$0\.17 · 1K Cancel Generate 2/);
  });

  it('before the check: no month, the built-in estimates where Atelier gave none', () => {
    const t = text(render(shown(), { open: 'p1', status: atelier({ token: { ...token, month: null, estimates: { nb: 0.05 } } }) }));
    expect(t).toMatch(/Through Atelier · into the collection «L'Ancora di Sabaoth» Change Model/);
    expect(t).toMatch(/GPT Image 2\.6 Best detail and text ≈ \$0\.04 .* Nano Banana 2\.1 Fast draft ≈ \$0\.05/);
  });

  it('names the collection as the server does', () => {
    const long = 'A'.repeat(59) + '😀 and more';
    const t = text(render(shown(), { open: 'p1', status: atelier(), projectTitle: `  ${long}` }));
    expect(t).toContain(`into the collection «${'A'.repeat(59)}»`);
    expect(text(render(shown(), { open: 'p1', status: atelier(), projectTitle: '  ' }))).toContain('«Promptbook project»');
  });

  it('screen 5: no token yet', () => {
    const html = render(shown(), { open: 'p1', status: atelier({ token: null }) });
    expect(text(html)).toMatch(
      /Generate images ✕ Add your Atelier API token first\. Images are billed against your Atelier monthly cap\. Open Settings → Image generation No images yet/,
    );
    expect(html).toMatch(/href="\/settings\/image-generation"/);
  });

  it('a server without Atelier, Atelier still chosen', () => {
    const t = text(render(shown(), { open: 'p1', status: atelier({ available: false, url: null, token: null }) }));
    expect(t).toMatch(/Generate images ✕ This server has no Atelier address\. Open Settings → Image generation/);
  });

  it('screen 7: OpenRouter chosen with both set up keeps OpenRouter’s estimates', () => {
    const t = text(render(shown(), { open: 'p1', status: ready({ atelier: { available: true, url: 'u', token } }) }));
    expect(t).toMatch(/Through OpenRouter · billed to your OpenRouter key Change Model GPT Image 2\.6 Best detail and text ≈ \$0\.04/);
  });

  it('a running Atelier job says so', () => {
    const t = text(render(shown(), { jobs: new Map([['p1', job({ provider: 'atelier' })]]) }));
    expect(t).toMatch(/Generating 2 of 4 with GPT Image 2\.6 through Atelier · 4[78]s\./);
  });
});

describe('«Generated here»', () => {
  const here = (spending: Generation['spending']) => text(render(shown(), { spending }, createElement(GeneratedHere)));

  it('names the providers on the board in its title', () => {
    const html = render(shown(), { spending: { images: 3, cost: 0.2 }, spendingTitle: 'X and Y' }, createElement(GeneratedHere));
    expect(html).toMatch(/<span class="spend" title="X and Y">/);
  });

  it("totals the project's images and their cost", () => {
    expect(here({ images: 3, cost: 0.12 })).toBe('Generated here: 3 images · $0.12');
    expect(here({ images: 1, cost: 0.041 })).toBe('Generated here: 1 image · $0.04');
  });

  it('shows a cost billed for images that then failed, hides nothing spent', () => {
    expect(here({ images: 0, cost: 0.04 })).toBe('Generated here: 0 images · $0.04');
    expect(here({ images: 0, cost: 0 })).toBe('');
    // Offline, or the request failed.
    expect(here(null)).toBe('');
  });
});

describe('offline on the desktop', () => {
  it('turns Generate off with the reason', () => {
    const html = render(shown(), { offline: true });
    expect(html).toMatch(
      /<button class="tb sm gen" disabled="" title="Generating needs the server\. It comes back when this computer is online\." aria-expanded="false"/,
    );
  });

  it('turns Try again off on an error line', () => {
    const failed = job({ done: 0, error: 'OpenRouter did not answer. Try again. Nothing was charged.', finishedAt: new Date().toISOString() });
    const html = render(shown(), { offline: true, jobs: new Map([['p1', failed]]) });
    expect(html).toMatch(/<button class="tb sm line" disabled="" title="Generating needs the server\.[^"]*">Try again<\/button>/);
  });

  it('says on the board that Generate comes back online, unless files wait to upload', () => {
    const line = (offline: boolean, waiting: number) =>
      text(renderToStaticMarkup(createElement(OfflineNotice, { offline, waiting })));
    expect(line(true, 0)).toBe(
      'Offline. Choosing, editing and dropping files still work. Generate comes back when this computer is online.',
    );
    expect(line(true, 2)).toBe(
      '2 files on this computer, uploaded when you are back online. Choosing and editing prompts work offline; they sync too.',
    );
    expect(line(false, 0)).toBe('');
    expect(line(false, 2)).toBe('');
  });
});
