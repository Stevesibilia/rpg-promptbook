// Bundles the server and the command line into dist/. The workspace packages
// export TypeScript source, so they are inlined; npm dependencies stay
// external and come from node_modules at run time (design decision 4).
import { build } from 'esbuild';

const workspace = /^promptbook-/;

// src/fixtures.ts reads the format package's fixtures from disk; in the
// bundle the same function answers their text, loaded as text by esbuild,
// since the image has no fixtures folder.
const fixtures = ['l-ancora-di-sabaoth.converted.md', 'esempio.md'];
const inlineFixtures = {
  name: 'inline-fixtures',
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]fixtures\.ts$/ }, () => ({
      contents: [
        ...fixtures.map((name, i) => `import f${i} from '../../format/fixtures/${name}';`),
        `const texts = { ${fixtures.map((name, i) => `${JSON.stringify(name)}: f${i}`).join(', ')} };`,
        'export function fixture(name) { return texts[name]; }',
      ].join('\n'),
      loader: 'js',
      resolveDir: new URL('../src', import.meta.url).pathname,
    }));
  },
};

await build({
  entryPoints: { main: 'src/main.ts', cli: 'src/cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  sourcemap: true,
  logLevel: 'info',
  loader: { '.md': 'text' },
  plugins: [
    inlineFixtures,
    {
      name: 'external-npm',
      setup(build) {
        build.onResolve({ filter: /^[^./]/ }, (args) =>
          workspace.test(args.path) || args.kind === 'entry-point' ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
