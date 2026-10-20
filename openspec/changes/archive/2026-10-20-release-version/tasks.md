## 1. Release in the rail

- [x] 1.1 Platform seam: `releaseVersion(): Promise<string | null>` in `packages/web/src/platform/index.ts`, with the web (`/api/health`, once, `dev` → null) and desktop (`DeviceInfo.version`) implementations of design decision 2
- [x] 1.2 `Shell.tsx`: the label under Settings with its role, aria-label and tooltip; CSS in the rail's stylesheet; hidden where the rail is hidden
- [x] 1.3 Unit tests: web platform (version, `dev`, error, one fetch), desktop platform (version, `0.0.0`), Shell renders the label only when known
- [x] 1.4 e2e: the browser stack shows the label when the compose stack sets `APP_VERSION` (set it in the e2e compose if it is not set), and the desktop project shows the app's version
- [x] 1.5 Screenshots of the rail in the browser and in the desktop app, light and dark, in the hand-back
- [x] 1.6 `npm run typecheck`, `npm test`, `npm run e2e` green; hand-back
