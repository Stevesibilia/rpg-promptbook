// Bundles the server and the command line into dist/. The workspace packages
// export TypeScript source, so they are inlined; npm dependencies stay
// external and come from node_modules at run time (design decision 4).
import { build } from 'esbuild';

const workspace = /^promptbook-/;

await build({
  entryPoints: { main: 'src/main.ts', cli: 'src/cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
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
