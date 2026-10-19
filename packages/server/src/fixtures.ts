import { readFileSync } from 'node:fs';

// The format package's fixtures the seed uses. Read from the package here;
// scripts/build.mjs replaces this module so the bundle carries their text,
// since the image has no fixtures folder.

export type FixtureName = 'l-ancora-di-sabaoth.converted.md' | 'esempio.md';

export function fixture(name: FixtureName): string {
  return readFileSync(new URL(`../../format/fixtures/${name}`, import.meta.url), 'utf8');
}
