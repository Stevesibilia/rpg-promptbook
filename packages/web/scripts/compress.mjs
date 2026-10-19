// Writes a Brotli (.br) and a gzip (.gz) copy next to every compressible file
// of the build, which the server sends to browsers that accept them (design
// decision 15). The PDF engine's 29 MB of WebAssembly travels as about 8 MB.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const compressible = /\.(wasm|js|css|svg)$/;

const files = (await readdir(dist, { recursive: true })).filter((file) => compressible.test(file));
await Promise.all(
  files.map(async (file) => {
    const path = join(dist, file);
    const bytes = await readFile(path);
    const [br, gzipped] = await Promise.all([
      brotli(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
        },
      }),
      gz(bytes, { level: constants.Z_BEST_COMPRESSION }),
    ]);
    await Promise.all([writeFile(`${path}.br`, br), writeFile(`${path}.gz`, gzipped)]);
  }),
);
console.log(`Compressed ${files.length} files in ${dist}`);
