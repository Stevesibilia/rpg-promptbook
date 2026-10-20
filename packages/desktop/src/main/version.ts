import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The app's version, from its package.json: the one beside dist/ in the
// repository, inside app.asar once packaged (set from the tag, design
// decision 16). Unpackaged, Electron's app.getVersion() answers Electron's
// own version when started on dist/main.cjs, as the tests do.
export function appVersion(distDir: string, fallback: string): string {
  try {
    const version = (JSON.parse(readFileSync(join(distDir, '..', 'package.json'), 'utf8')) as { version?: unknown })
      .version;
    return typeof version === 'string' && version ? version : fallback;
  } catch {
    return fallback;
  }
}
