// The files the engine needs besides the compiler, as URLs next to this
// module: a bundler (Vite) emits each one as an asset, and Node reads them
// with fileURLToPath. Every URL is written out so a bundler can see it.

import type { EngineAssets } from './engine.js';

export interface AssetFile {
  // Where the template finds the file inside the compiler.
  path: string;
  url: URL;
}

export const fontUrls: URL[] = [
  new URL('../fonts/spectral/Spectral-Regular.ttf', import.meta.url),
  new URL('../fonts/spectral/Spectral-Italic.ttf', import.meta.url),
  new URL('../fonts/spectral/Spectral-SemiBold.ttf', import.meta.url),
  new URL('../fonts/spectral/Spectral-SemiBoldItalic.ttf', import.meta.url),
  new URL('../fonts/im-fell-english/IMFeENrm28P.ttf', import.meta.url),
  new URL('../fonts/im-fell-english/IMFeENit28P.ttf', import.meta.url),
  new URL('../fonts/ibm-plex-sans-condensed/IBMPlexSansCondensed-Regular.ttf', import.meta.url),
  new URL('../fonts/ibm-plex-sans-condensed/IBMPlexSansCondensed-SemiBold.ttf', import.meta.url),
];

export const typstFiles: AssetFile[] = [
  { path: '/avventura.typ', url: new URL('../typst/avventura.typ', import.meta.url) },
  { path: '/cmarker/lib.typ', url: new URL('../typst/cmarker/lib.typ', import.meta.url) },
  { path: '/cmarker/plugin.wasm', url: new URL('../typst/cmarker/plugin.wasm', import.meta.url) },
  { path: '/cmarker/typst.toml', url: new URL('../typst/cmarker/typst.toml', import.meta.url) },
];

// Reads every font and Typst file with `read` (fetch in a browser, readFile
// in Node). The compiler's WASM is the caller's to resolve.
export async function loadAssets(
  compilerWasm: EngineAssets['compilerWasm'],
  read: (url: URL) => Promise<Uint8Array>,
): Promise<EngineAssets> {
  const [fonts, files] = await Promise.all([
    Promise.all(fontUrls.map(read)),
    Promise.all(typstFiles.map(async (file) => ({ path: file.path, bytes: await read(file.url) }))),
  ]);
  return { compilerWasm, fonts, files };
}
