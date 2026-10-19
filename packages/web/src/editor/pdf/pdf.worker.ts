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

async function build({ engine, renderer }: Tools, request: PdfRequest): Promise<PdfBuild> {
  const result = await engine.build(inputOf(request));
  const empty = { svg: null, pages: [], positions: [], checks: [], diagnostics: result.diagnostics };
  if (result.diagnostics.some((d) => d.severity === 'error') || !result.vector.length) return empty;
  const svg = await renderer.runWithSession(async (session) => {
    renderer.manipulateData({ renderSession: session, action: 'reset', data: result.vector });
    return renderer.renderSvg({
      renderSession: session,
      data_selection: { body: true, defs: true, css: false, js: false },
    });
  });
  const prepared = prepareSvg(svg);
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
    return post({ kind: 'failed', error: error instanceof Error ? error.message : String(error) });
  }
  const { version } = request;
  if (request.kind === 'build') {
    let result: PdfBuild;
    try {
      result = await build(loaded, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = { svg: null, pages: [], positions: [], checks: [], diagnostics: [{ severity: 'error', message }] };
    }
    return post({ kind: 'build', version, build: result });
  }
  try {
    // A copy of its own, so the transfer cannot take the compiler's memory.
    const bytes = (await loaded.engine.pdf(inputOf(request))).slice();
    post({ kind: 'pdf', version, bytes }, [bytes.buffer]);
  } catch (error) {
    post({ kind: 'pdf', version, error: error instanceof Error ? error.message : String(error) });
  }
}

// One request at a time: they share the engine and the renderer.
let queue: Promise<void> = Promise.resolve();
self.addEventListener('message', (event: MessageEvent<PdfRequest>) => {
  queue = queue.then(() => answer(event.data));
});
