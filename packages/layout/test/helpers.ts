import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAssets, type EngineAssets, type Position } from '../src/index.js';

// The browser build of the compiler, as the web worker loads it.
export function compilerWasm(): Uint8Array {
  return readFileSync(fileURLToPath(import.meta.resolve('@myriaddreamin/typst-ts-web-compiler/wasm')));
}

export async function nodeAssets(): Promise<EngineAssets> {
  return loadAssets(compilerWasm(), async (url) => new Uint8Array(await readFile(fileURLToPath(url))));
}

// L'Ancora di Sabaoth as the app holds it, with the footer's keys added.
export function sabaoth(): string {
  const text = readFileSync(
    new URL('../../format/fixtures/l-ancora-di-sabaoth.converted.md', import.meta.url),
    'utf8',
  );
  return text.replace(
    /^---\n/,
    '---\nautore: Stefano Sibilia\ncopyright: © 2026 Stefano Sibilia\nlicenza: CC-BY-NC-SA-4.0\n',
  );
}

export function position(kind: Position['kind'], from: number, page: number, y: number, id?: string): Position {
  return { kind, from, page, y, ...(id ? { id } : {}) };
}
