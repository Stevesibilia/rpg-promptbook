import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEngine, fontUrls, LayoutError, type Engine, type LayoutInput } from '../src/index.js';
import { compilerWasm } from './helpers.js';

// A small template in place of the real one: a page per scene, with the
// marks the engine reads.
const TEMPLATE = `
#let avventura(input) = {
  if input.at("fail", default: false) { panic("the template failed") }
  set page(
    paper: input.options.paper,
    foreground: context [#metadata((page: here().page(), width: page.width.pt(), height: page.height.pt()))<pb-page>],
  )
  set text(font: "Spectral")
  for scene in input.scenes {
    pagebreak(weak: true)
    context [#metadata((kind: "scene", id: scene.id, from: scene.from, page: here().page(), y: here().position().y.pt()))<pb-pos>]
    heading(scene.id)
    lorem(scene.words)
  }
}
`;

const input = ({ paper = 'a4', ...extra }: Record<string, unknown> = {}) =>
  ({
    options: { paper, inkSaver: false, pregenerated: true, template: 'avventura@1' },
    scenes: [
      { id: 'S2', from: 200, words: 30 },
      { id: 'S1', from: 100, words: 1200 },
    ],
    ...extra,
  }) as unknown as LayoutInput;

let engine: Engine;

const assets = async () => ({
  compilerWasm: compilerWasm(),
  fonts: await Promise.all(fontUrls.map(async (url) => new Uint8Array(await readFile(fileURLToPath(url))))),
  files: [{ path: '/avventura.typ', bytes: new TextEncoder().encode(TEMPLATE) }],
});

beforeAll(async () => {
  engine = await createEngine(await assets());
});

describe('createEngine', () => {
  // The web server's content security policy refuses `new Function` and eval
  // in the browser's PDF worker.
  it('evaluates no JavaScript from strings', async () => {
    const original = globalThis.Function;
    const refuse = () => {
      throw new EvalError('Evaluating a string as JavaScript is refused');
    };
    globalThis.Function = new Proxy(original, { apply: refuse, construct: refuse });
    try {
      const created = await createEngine(await assets());
      expect((await created.build(input())).diagnostics).toEqual([]);
      expect((await created.pdf(input())).length).toBeGreaterThan(0);
    } finally {
      globalThis.Function = original;
    }
  });

  it('puts the real Function back, also when the init fails', async () => {
    const original = globalThis.Function;
    await createEngine(await assets());
    expect(globalThis.Function).toBe(original);
    // The compiler's bytes cannot be read: its init throws.
    const broken = Object.defineProperty(await assets(), 'compilerWasm', {
      get() {
        throw new Error('unreadable');
      },
    });
    await expect(createEngine(broken)).rejects.toThrow('unreadable');
    expect(globalThis.Function).toBe(original);
  });

  it('answers the placeholders without the real Function', async () => {
    const seen: unknown[][] = [];
    const original = globalThis.Function;
    globalThis.Function = new Proxy(original, {
      construct(target, args: unknown[], newTarget) {
        seen.push(args);
        return Reflect.construct(target, args, newTarget);
      },
    });
    try {
      await createEngine(await assets());
    } finally {
      globalThis.Function = original;
    }
    // The five placeholders never reach it.
    expect(seen).toEqual([]);
  });
});

describe('build', () => {
  it('returns the vector, the pages and the positions sorted by page', async () => {
    const result = await engine.build(input());
    expect(result.diagnostics).toEqual([]);
    expect(result.vector.length).toBeGreaterThan(0);
    expect(result.pages.length).toBeGreaterThanOrEqual(3);
    expect(result.pages[0]!.width).toBeCloseTo(595.28, 1);
    expect(result.pages[0]!.height).toBeCloseTo(841.89, 1);
    expect(result.positions.map((p) => [p.id, p.page])).toEqual([
      ['S2', 1],
      ['S1', 2],
    ]);
  });

  it('builds on Letter paper', async () => {
    const result = await engine.build(input({ paper: 'us-letter' }));
    expect(result.pages[0]!.width).toBeCloseTo(612, 1);
    expect(result.pages[0]!.height).toBeCloseTo(792, 1);
  });

  it('returns a build error in the diagnostics instead of throwing', async () => {
    const result = await engine.build(input({ fail: true }));
    expect(result.diagnostics).toEqual([{ severity: 'error', message: 'panicked with: the template failed' }]);
    expect(result.pages).toEqual([]);
    // And the next build works again.
    expect((await engine.build(input())).diagnostics).toEqual([]);
  });

  it('runs one build at a time', async () => {
    const [a, b] = await Promise.all([
      engine.build(input({ paper: 'us-letter' })),
      engine.build(input()),
    ]);
    expect(a.pages[0]!.width).toBeCloseTo(612, 1);
    expect(b.pages[0]!.width).toBeCloseTo(595.28, 1);
  });
});

describe('pdf', () => {
  it('gives the same PDF bytes twice', async () => {
    const first = await engine.pdf(input());
    const second = await engine.pdf(input());
    expect(new TextDecoder().decode(first.slice(0, 5))).toBe('%PDF-');
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('throws a LayoutError with the diagnostics when the document does not build', async () => {
    const error = await engine.pdf(input({ fail: true })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LayoutError);
    expect((error as LayoutError).message).toBe('panicked with: the template failed');
  });
});
