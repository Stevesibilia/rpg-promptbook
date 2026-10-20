// Bundles main and the preload into dist/ and copies the web client's build
// into app/web (design decisions 1 and 2). Run after
// `npm run build -w promptbook-web`. Everything but Electron is inlined: the
// workspace packages export TypeScript source, and the app ships no
// node_modules of its own.
import { cp, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const appWeb = fileURLToPath(new URL('../app/web/', import.meta.url));

try {
  await stat(`${webDist}index.html`);
} catch {
  throw new Error(`No web build at ${webDist}: run npm run build -w promptbook-web first.`);
}

const common = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Electron 44 runs Node 24.
  target: 'node24',
  sourcemap: true,
  logLevel: 'info',
  external: ['electron'],
};

await build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main.cjs' });
// The sandboxed preload may require only electron's own modules.
await build({ ...common, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload.cjs' });

// The server sends the .br and .gz copies to browsers; the protocol serves
// the plain files. The type declarations tsc writes beside the build are not
// part of it either.
await rm(appWeb, { recursive: true, force: true });
await cp(webDist, appWeb, {
  recursive: true,
  filter: (source) => {
    const path = source.slice(webDist.length - 1).replace(/\\/g, '/');
    return !/\.(br|gz)$/.test(path) && !/\.tsbuildinfo$/.test(path) && !path.startsWith('/types');
  },
});
console.log(`Copied the web build to ${appWeb}`);
