import { createTypstRenderer, type TypstRenderer } from '@myriaddreamin/typst.ts';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';
import { parseAdventure, templates } from 'promptbook-format';
import { createEngine, layoutChecks, loadAssets, toLayoutInput, type Engine } from 'promptbook-layout';
import { prepareSvg } from './pages.js';
import type { PdfAnswer, PdfBuild, PdfRequest } from './protocol.js';

// Builds the PDF off the main thread (design decision 9): the layout
// engine, and typst.ts's renderer for the pages the preview draws. Both
// load on the first request.

const fetchBytes = async (url: URL | string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${String(url)} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

interface Tools {
  engine: Engine;
  renderer: TypstRenderer;
}

async function load(): Promise<Tools> {
  const [assets, rendererWasm] = await Promise.all([
    fetchBytes(compilerWasmUrl).then((wasm) => loadAssets(wasm, fetchBytes)),
    fetchBytes(rendererWasmUrl),
  ]);
  const renderer = createTypstRenderer();
  const [engine] = await Promise.all([createEngine(assets), renderer.init({ getModule: () => rendererWasm })]);
  return { engine, renderer };
}

let tools: Promise<Tools> | null = null;

const post = (answer: PdfAnswer, transfer: Transferable[] = []) => self.postMessage(answer, { transfer });

const inputOf = ({ text, options, project }: PdfRequest) =>
  toLayoutInput(parseAdventure(text, { template: templates.avventura }).model, options, project);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const failedBuild = (diagnostics: PdfBuild['diagnostics']): PdfBuild => ({
  svg: null,
  pages: [],
  positions: [],
  checks: [],
  diagnostics,
});
// A build with no error that still drew nothing is a failed one.
const NOTHING = { severity: 'error', message: 'The layout produced no pages.' } as const;

async function build({ engine, renderer }: Tools, request: PdfRequest): Promise<PdfBuild> {
  const result = await engine.build(inputOf(request));
  if (result.diagnostics.some((d) => d.severity === 'error')) return failedBuild(result.diagnostics);
  if (!result.vector.length) return failedBuild([...result.diagnostics, NOTHING]);
  const svg = await renderer.runWithSession(async (session) => {
    renderer.manipulateData({ renderSession: session, action: 'reset', data: result.vector });
    return renderer.renderSvg({
      renderSession: session,
      data_selection: { body: true, defs: true, css: false, js: false },
    });
  });
  const prepared = prepareSvg(svg);
  if (!prepared.pages.length) return failedBuild([...result.diagnostics, NOTHING]);
  return {
    svg: prepared.svg,
    pages: prepared.pages,
    positions: result.positions,
    checks: layoutChecks(result.positions, result.pages),
    diagnostics: result.diagnostics,
  };
}

async function answer(request: PdfRequest): Promise<void> {
  let loaded: Tools;
  try {
    loaded = await (tools ??= load());
  } catch (error) {
    return post({ kind: 'failed', error: message(error) });
  }
  const { version } = request;
  if (request.kind === 'build') {
    return post({ kind: 'build', version, build: await build(loaded, request) });
  }
  // A copy of its own, so the transfer cannot take the compiler's memory.
  const bytes = (await loaded.engine.pdf(inputOf(request))).slice();
  post({ kind: 'pdf', version, bytes }, [bytes.buffer]);
}

// Every request gets an answer, an error when anything fails.
async function answerOrError(request: PdfRequest): Promise<void> {
  try {
    await answer(request);
  } catch (error) {
    const { version } = request;
    if (request.kind === 'build')
      post({ kind: 'build', version, build: failedBuild([{ severity: 'error', message: message(error) }]) });
    else post({ kind: 'pdf', version, error: message(error) });
  }
}

// One request at a time: they share the engine and the renderer. The queue
// never rejects, so a failed request cannot stop the next ones.
let queue: Promise<void> = Promise.resolve();
self.addEventListener('message', (event: MessageEvent<PdfRequest>) => {
  queue = queue.then(() => answerOrError(event.data)).catch(() => undefined);
});
