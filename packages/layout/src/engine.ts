// The PDF engine: Typst's WASM compiler with the template, its fonts and
// cmarker. The same code runs in a browser worker and in Node; the caller
// hands it the bytes (see assets.ts).

import { createTypstCompiler, type BeforeBuildFn, type TypstCompiler } from '@myriaddreamin/typst.ts';
import type { LayoutInput } from './input.js';
import { sortPositions, type Position } from './positions.js';

export interface EngineAssets {
  compilerWasm: Uint8Array | ArrayBuffer;
  fonts: Uint8Array[];
  // The template and cmarker, at the paths assets.ts names.
  files: { path: string; bytes: Uint8Array }[];
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
}

export interface BuildResult {
  // The document in typst.ts's vector format, for its renderer.
  vector: Uint8Array;
  // In points.
  pages: { width: number; height: number }[];
  positions: Position[];
  diagnostics: Diagnostic[];
}

export interface Engine {
  build(input: LayoutInput): Promise<BuildResult>;
  // Throws a LayoutError when the document does not build.
  pdf(input: LayoutInput): Promise<Uint8Array>;
}

export class LayoutError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.find((d) => d.severity === 'error')?.message ?? 'The PDF could not be built.');
    this.name = 'LayoutError';
    this.diagnostics = diagnostics;
  }
}

const MAIN = '/main.typ';
const INPUT = '/input.json';
const TEMPLATES: Record<LayoutInput['options']['template'], string> = {
  'avventura@1': '/avventura.typ',
};
// The compile format is the enum's value: the string "pdf" silently gives
// the vector format.
const PDF_FORMAT = 1;

interface RawDiagnostic {
  severity?: string;
  message?: string;
}

// The compiler's "full" diagnostics; the hints are the error's call trace
// ("while calling …"), left out.
function toDiagnostics(raw: unknown): Diagnostic[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawDiagnostic[])
    .filter((item) => /^(error|warning)$/i.test(item.severity ?? ''))
    .map((item) => ({
      severity: /^error$/i.test(item.severity ?? '') ? 'error' : 'warning',
      message: item.message ?? '',
    }));
}

function thrown(error: unknown): Diagnostic[] {
  return [{ severity: 'error', message: error instanceof Error ? error.message : String(error) }];
}

const hasError = (diagnostics: Diagnostic[]) => diagnostics.some((d) => d.severity === 'error');

// String evaluation. typst.ts 0.8.0-rc3 evaluates strings while it
// initialises, which a content security policy without 'unsafe-eval' refuses
// in the browser (design decision 4). A bump of typst.ts must run the engine
// test that refuses string evaluation before anything else: these answers
// match its sources exactly, and a changed source fails loudly.

// Hands the fonts to the compiler. typst.ts's own loadFonts, and
// disableDefaultFontAssets which calls it, build a `new Function` on every
// call. The two markers are what the compiler's init looks for: fonts are
// taken care of, and its default ones are not to be fetched from a CDN.
function loadFonts(fonts: Uint8Array[]): BeforeBuildFn {
  const loader = async (_: unknown, { builder }: { builder: { add_raw_font(font: Uint8Array): Promise<void> } }) => {
    for (const font of fonts) await builder.add_raw_font(font);
  };
  return Object.assign(loader, { _preloadRemoteFontOptions: { assets: false }, _kind: 'fontLoader' });
}

// The compiler's builder (Rust, through wasm-bindgen) makes five placeholder
// functions with `new Function(...parameters, body)` when it is created.
// Keyed by their parameters and body, as JSON.
const placeholder = (parameters: string[], body: string) => JSON.stringify([...parameters, body]);
const PLACEHOLDERS = new Map<string, (...args: never[]) => unknown>([
  [placeholder([], 'return 0'), () => 0],
  [placeholder([], 'return true'), () => true],
  [placeholder(['path'], 'return path'), (path: string) => path],
  ...[
    'Dummy AccessModel, please initialize compiler with withAccessModel()',
    'Dummy Registry, please initialize compiler with withPackageRegistry()',
  ].map((message): [string, () => never] => [
    placeholder([], `throw new Error('${message}')`),
    () => {
      throw new Error(message);
    },
  ]),
]);

// Runs `task` (the compiler's init) with those five sources answered by plain
// closures; any other string still reaches the real constructor. The real
// one is back in place afterwards, whether the task worked or not.
async function withoutEval<T>(task: () => Promise<T>): Promise<T> {
  const original = globalThis.Function;
  const known = (args: unknown[]) => PLACEHOLDERS.get(JSON.stringify(args));
  // A minifier may write `new Function(…)` as `Function(…)`: both are caught.
  globalThis.Function = new Proxy(original, {
    construct: (target, args: unknown[], newTarget) => known(args) ?? Reflect.construct(target, args, newTarget),
    apply: (target, self, args: unknown[]) => known(args) ?? Reflect.apply(target, self, args),
  });
  try {
    return await task();
  } finally {
    globalThis.Function = original;
  }
}

interface PageMark {
  page: number;
  width: number;
  height: number;
}

export async function createEngine(assets: EngineAssets): Promise<Engine> {
  const compiler: TypstCompiler = createTypstCompiler();
  await withoutEval(() =>
    compiler.init({
      getModule: () => assets.compilerWasm,
      beforeBuild: [loadFonts(assets.fonts)],
    }),
  );
  for (const file of assets.files) compiler.mapShadow(file.path, file.bytes);

  // One build at a time: they share the compiler and its /input.json.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const prepare = (input: LayoutInput) => {
    const template = TEMPLATES[input.options.template];
    compiler.addSource(MAIN, `#import "${template}": avventura\n#avventura(json("${INPUT}"))\n`);
    compiler.mapShadow(INPUT, new TextEncoder().encode(JSON.stringify(input)));
  };

  return {
    build: (input) =>
      exclusive(async () => {
        const empty: BuildResult = { vector: new Uint8Array(), pages: [], positions: [], diagnostics: [] };
        try {
          prepare(input);
          return await compiler.runWithWorld({ mainFilePath: MAIN, inputs: {} }, async (world) => {
            const compiled = await world.compile({ diagnostics: 'full' });
            const diagnostics = toDiagnostics(compiled.diagnostics);
            if (compiled.hasError || hasError(diagnostics)) return { ...empty, diagnostics };
            const positions: Position[] = await world.query({ selector: '<pb-pos>', field: 'value' });
            const marks: PageMark[] = await world.query({ selector: '<pb-page>', field: 'value' });
            const vector = await world.vector({ diagnostics: 'full' });
            const pages: BuildResult['pages'] = [];
            for (const mark of marks) pages[mark.page - 1] = { width: mark.width, height: mark.height };
            return {
              vector: vector.result ?? new Uint8Array(),
              pages,
              positions: sortPositions(positions),
              diagnostics: [...diagnostics, ...toDiagnostics(vector.diagnostics)],
            };
          });
        } catch (error) {
          return { ...empty, diagnostics: thrown(error) };
        }
      }),

    pdf: (input) =>
      exclusive(async () => {
        let result: { result?: Uint8Array; diagnostics?: unknown[] };
        try {
          prepare(input);
          result = await compiler.compile({ mainFilePath: MAIN, inputs: {}, format: PDF_FORMAT, diagnostics: 'full' });
        } catch (error) {
          throw new LayoutError(thrown(error));
        }
        const diagnostics = toDiagnostics(result.diagnostics);
        if (!result.result || hasError(diagnostics)) throw new LayoutError(diagnostics);
        return result.result;
      }),
  };
}
