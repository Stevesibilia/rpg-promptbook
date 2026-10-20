import { defineConfig } from 'vitest/config';

// The main process's logic in Node, without Electron: the store on a real
// node:sqlite database, the router, sign-in against a fake authorization
// server, offline create and local snapshots (design decision 17). The proof
// against the compose stack is test/stack, run by `npm run prove`.
export default defineConfig({
  test: { include: ['test/unit/**/*.test.ts'] },
});
