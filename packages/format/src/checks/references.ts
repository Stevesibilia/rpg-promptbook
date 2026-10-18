import type { Problem } from '../model.js';
import { findSheets } from '../parse/references.js';
import type { Check } from './index.js';
import { problem } from './util.js';

// "→ Schede:" targets that match no sheet or several, and graded sheets cited
// in a scene without being listed among its cast. The parser has already put
// the resolved sheet's id on each reference that matches exactly one.
export const checkReferences: Check = ({ model, template }) => {
  const out: Problem[] = [];
  const cast = template.sceneFields.find((f) => f.role === 'cast')?.label;
  const graded = new Set(model.sheets.filter((s) => s.threat?.grade).map((s) => s.id));

  for (const scene of model.scenes) {
    const sceneId = scene.id ?? undefined;
    const inCast = new Set(scene.references.filter((r) => r.sheet && r.field === cast).map((r) => r.sheet!));
    const warned = new Set<string>();
    for (const reference of scene.references) {
      if (!reference.sheet) {
        const found = findSheets(model.sheets, reference.target);
        out.push(
          found.length === 0
            ? problem('ref.unresolved', 'error', `No sheet matches "${reference.target}".`, reference.range, { sceneId })
            : problem(
                'ref.ambiguous',
                'error',
                `"${reference.target}" matches ${found.length} sheets: ${found.map((s) => `"${s.title}"`).join(', ')}.`,
                reference.range,
                { sceneId },
              ),
        );
      } else if (graded.has(reference.sheet) && !inCast.has(reference.sheet) && !warned.has(reference.sheet)) {
        warned.add(reference.sheet);
        const sheet = model.sheets.find((s) => s.id === reference.sheet)!;
        out.push(
          problem(
            'ref.threat.outside',
            'warning',
            `"${sheet.name}" has a grade but is not listed under "${cast ?? 'the cast'}" in ${scene.id ?? 'this scene'}, so it gets no threat box.`,
            reference.range,
            { sceneId },
          ),
        );
      }
    }
  }
  return out;
};
