import type { Model, TextEdit } from 'promptbook-format';
import { templates } from 'promptbook-format';

// The board's Add the appendix (asset-board design decision 12): the
// appendix heading, when the document has none, and one row per scene with
// empty visual: and mood: lines.

const template = templates.avventura;
const section = template.sections.find((s) => s.role === 'appendix')!;
const HEADING = `## ${section.heading ?? section.name}`;
const { visual, mood } = template.appendix;

// The scenes the rows are for: those with an id, each id once.
function sceneRows(model: Pick<Model, 'scenes'>): string {
  const seen = new Set<string>();
  let rows = '';
  for (const scene of model.scenes) {
    if (scene.id === null || seen.has(scene.id)) continue;
    seen.add(scene.id);
    rows += `\n### ${scene.id}. ${scene.title}\n\n${visual}:\n\n${mood}:\n`;
  }
  return rows;
}

// The edit that adds the appendix, or its rows to an appendix with none;
// null when the appendix already has rows.
export function appendixEdit(text: string, model: Pick<Model, 'sections' | 'scenes' | 'appendix'>): TextEdit | null {
  const existing = model.sections.find((s) => s.role === 'appendix');
  if (existing) {
    if (model.appendix.length > 0) return null;
    const at = existing.range.end.offset;
    const lead = text.slice(0, at).endsWith('\n') ? '' : '\n';
    // The section ends before its last line break, which then ends the rows.
    const rows = text[at] === '\n' ? sceneRows(model).replace(/\n$/, '') : sceneRows(model);
    return { from: at, to: at, insert: lead + rows };
  }
  const lead = text === '' || text.endsWith('\n') ? '' : '\n';
  return { from: text.length, to: text.length, insert: `${lead}\n${HEADING}\n${sceneRows(model)}` };
}
