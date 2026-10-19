import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Position } from '../src/index.js';

// The browser build of the compiler, as the web worker loads it.
export function compilerWasm(): Uint8Array {
  return readFileSync(fileURLToPath(import.meta.resolve('@myriaddreamin/typst-ts-web-compiler/wasm')));
}

export function position(kind: Position['kind'], from: number, page: number, y: number, id?: string): Position {
  return { kind, from, page, y, ...(id ? { id } : {}) };
}
