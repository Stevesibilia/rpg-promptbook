import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development Vite serves the web client and passes the API and the sync
// socket to the server on port 3000 (design decision 9). The proxy keeps the
// browser's Host and Origin headers, so the server must run with PUBLIC_URL
// set to Vite's origin (http://localhost:5173) for its Origin checks to pass.
const server = process.env.PROMPTBOOK_SERVER ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  build: {
    // The main chunk carries the format package, which the import preview and
    // the new-project preview run in the browser; CodeMirror is split off.
    chunkSizeWarningLimit: 1000,
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
