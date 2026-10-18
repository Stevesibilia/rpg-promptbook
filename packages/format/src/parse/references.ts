import type { Model, Sheet } from '../model.js';
import { slug } from './source.js';

const norm = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

// The sheets a reference target can mean: by full title first, then by the
// part before the comma (its name or its id). One result is a resolution,
// none is unresolved, more than one is ambiguous.
export function findSheets(sheets: Sheet[], target: string): Sheet[] {
  const full = sheets.filter((s) => norm(s.title) === norm(target));
  if (full.length > 0) return full;
  const name = norm(target.split(',')[0]!);
  if (!name) return [];
  const id = slug(name);
  return sheets.filter((s) => norm(s.name) === name || (id !== '' && s.id === id));
}

// Fills `sheet` on every reference that resolves to exactly one sheet.
export function resolveReferences(model: Model): void {
  for (const scene of model.scenes) {
    for (const reference of scene.references) {
      const found = findSheets(model.sheets, reference.target);
      if (found.length === 1) reference.sheet = found[0]!.id;
      else delete reference.sheet;
    }
  }
}
