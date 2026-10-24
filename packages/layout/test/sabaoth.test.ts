import { parseAdventure, templates } from 'promptbook-format';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createEngine,
  defaultLayoutOptions,
  toLayoutInput,
  type BuildResult,
  type Engine,
  type LayoutOptions,
} from '../src/index.js';
import { nodeAssets, sabaoth } from './helpers.js';

const { model } = parseAdventure(sabaoth(), { template: templates.avventura });
const input = (options: Partial<LayoutOptions> = {}) =>
  toLayoutInput(model, { ...defaultLayoutOptions, ...options }, { title: 'Sabaoth' }, templates.avventura);
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

let engine: Engine;
let built: BuildResult;

beforeAll(async () => {
  engine = await createEngine(await nodeAssets());
  built = await engine.build(input());
});

describe('the PDF of Sabaoth', () => {
  it('builds with no error', () => {
    expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('has between 12 and 18 A4 pages', () => {
    expect(built.pages.length).toBeGreaterThanOrEqual(12);
    expect(built.pages.length).toBeLessThanOrEqual(18);
    for (const page of built.pages) {
      expect(page.width).toBeCloseTo(595.28, 1);
      expect(page.height).toBeCloseTo(841.89, 1);
    }
  });

  it('starts every scene on a new page', () => {
    const scenes = built.positions.filter((p) => p.kind === 'scene');
    expect(scenes.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    for (const scene of scenes) {
      const index = built.positions.indexOf(scene);
      expect(built.positions[index - 1]!.page).toBeLessThan(scene.page);
    }
  });

  it('ends every scene after it starts', () => {
    for (const end of built.positions.filter((p) => p.kind === 'scene-end')) {
      const start = built.positions.find((p) => p.kind === 'scene' && p.id === end.id)!;
      expect(end.page * 10_000 + end.y).toBeGreaterThan(start.page * 10_000 + start.y);
    }
  });

  it('prints the references to the sheets after the scenes', () => {
    const lastScene = built.positions.findLast((p) => p.kind === 'scene-end')!;
    const references = built.positions.find((p) => p.kind === 'part' && p.id === 'references')!;
    expect(references.page).toBeGreaterThan(lastScene.page);
  });

  it('builds again in under a second', async () => {
    const start = performance.now();
    const again = await engine.build(input());
    expect(performance.now() - start).toBeLessThan(1000);
    expect(again.positions).toEqual(built.positions);
  });
});

describe('the saved PDF', () => {
  it('starts with %PDF and is the same twice', async () => {
    const first = await engine.pdf(input());
    const second = await engine.pdf(input());
    expect(new TextDecoder().decode(first.slice(0, 5))).toBe('%PDF-');
    expect(same(first, second)).toBe(true);
  });

  it('changes with the options', async () => {
    const base = await engine.pdf(input());
    const inkSaver = await engine.pdf(input({ inkSaver: true }));
    const noPregenerated = await engine.pdf(input({ pregenerated: false }));
    expect(same(base, inkSaver)).toBe(false);
    expect(same(base, noPregenerated)).toBe(false);
    expect(noPregenerated.length).toBeLessThan(base.length);
  });

  it('prints on Letter paper', async () => {
    const letter = await engine.build(input({ paper: 'us-letter' }));
    expect(letter.diagnostics).toEqual([]);
    expect(letter.pages[0]!.width).toBeCloseTo(612, 1);
    expect(letter.pages[0]!.height).toBeCloseTo(792, 1);
  });

  it('leaves out the pregenerated when asked', async () => {
    const without = await engine.build(input({ pregenerated: false }));
    expect(without.positions.some((p) => p.id === 'pregenerated')).toBe(false);
    expect(built.positions.some((p) => p.id === 'pregenerated')).toBe(true);
  });
});

describe('a document with almost nothing in it', () => {
  it('builds, with the cover and the references only', async () => {
    const { model: empty } = parseAdventure('---\ntitolo: Vuota\n---\n\nSolo testo.\n', { template: templates.avventura });
    const result = await engine.build(toLayoutInput(empty, defaultLayoutOptions, { title: 'Vuota' }, templates.avventura));
    expect(result.diagnostics).toEqual([]);
    expect(result.positions.filter((p) => p.kind === 'part').map((p) => p.id)).toEqual(['cover', 'night', 'references']);
  });
});

describe('several read-alouds', () => {
  it('builds with two read-alouds in a scene and in Inizio forte, each at its own position', async () => {
    let text = sabaoth();
    for (const after of ['## Inizio forte', '### S1.']) {
      const at = text.indexOf('> [!leggi]', text.indexOf(after));
      text = `${text.slice(0, at)}> [!leggi]\n> Un brano in più.\n\n${text.slice(at)}`;
    }
    const two = toLayoutInput(
      parseAdventure(text, { template: templates.avventura }).model,
      defaultLayoutOptions,
      { title: 'Sabaoth' },
      templates.avventura,
    );
    const result = await engine.build(two);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const boxes = two.scenes[0]!.readAlouds.map((b) => b.from);
    expect(boxes).toHaveLength(2);
    for (const from of [...boxes, ...two.start.strongStart!.blocks.filter((b) => b.box?.role === 'readAloud').map((b) => b.from)]) {
      expect(result.positions.some((p) => p.kind === 'block' && p.from === from), `box at ${from}`).toBe(true);
    }
  });
});
