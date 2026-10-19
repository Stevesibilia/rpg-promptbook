import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development Vite serves the web client and passes the API and the sync
// socket to the server on port 3000 (design decision 9). The proxy keeps the
// browser's Host and Origin headers, so the server must run with PUBLIC_URL
// set to Vite's origin (http://localhost:5173) for its Origin checks to pass.
const server = process.env.PROMPTBOOK_SERVER ?? 'http://localhost:3000';

// The format package's Markdown parser decodes entities with
// decode-named-character-reference, whose browser build needs `document`,
// which the parse worker does not have. Its plain build works in both.
const decodeEntities = createRequire(import.meta.url).resolve('decode-named-character-reference');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { 'decode-named-character-reference': decodeEntities },
  },
  build: {
    // The main chunk carries the format package, which the import preview and
    // the new-project preview run in the browser; CodeMirror is split off.
    chunkSizeWarningLimit: 1000,
    // The PDF worker fetches the layout package's files (decision 9); a small
    // one inlined as a data: URL would be refused by the content security
    // policy's connect-src.
    assetsInlineLimit: (file) => (file.includes('/packages/layout/') ? false : undefined),
    rolldownOptions: {
      // typst.ts does not declare itself free of side effects, so importing
      // the layout package's pure helpers (pageOf, blockAt) on the page would
      // pull its whole JavaScript in. Only the PDF worker uses it.
      treeshake: { moduleSideEffects: (id) => !id.includes('/@myriaddreamin/') },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: server },
      '/sync': { target: server.replace(/^http/, 'ws'), ws: true },
    },
  },
});
