import type { ColumnMark, Fix, Problem } from '../model.js';
import type { Source } from '../parse/source.js';
import { columnMark, columnOfWord, nightPartOf, scenePartOf, type Column, type PlacedPart } from '../template/placement.js';
import type { Check } from './index.js';
import { problem } from './util.js';

// Column marks that do nothing (design decision A3 of template-placement):
// an unknown word on a part that takes a column, and any mark on a part that
// takes none. Both are warnings; the part prints where the template says.

const SCENE_TITLE_MARK = /\{[ \t]*(\p{L}+)[ \t]*\}$/u;

function replaceWith(mark: ColumnMark, column: Column): Fix {
  const insert = columnMark(column);
  return { title: `Write ${insert}`, edits: [{ from: mark.range.start.offset, to: mark.range.end.offset, insert }] };
}

// Deletes the mark and the spaces before it.
function removal(source: Source, mark: ColumnMark): Fix {
  let from = mark.range.start.offset;
  while (from > 0 && (source.text[from - 1] === ' ' || source.text[from - 1] === '\t')) from -= 1;
  return { title: 'Remove the mark', edits: [{ from, to: mark.range.end.offset, insert: '' }] };
}

export const checkColumns: Check = ({ model, template, source }) => {
  const out: Problem[] = [];
  const visit = (name: string, part: PlacedPart | null, mark: ColumnMark | null, sceneId?: string) => {
    if (!mark) return;
    if (!part) {
      const written = source.text.slice(mark.range.start.offset, mark.range.end.offset);
      out.push(
        problem('column.ignored', 'warning', `"${name}" takes no column: the mark ${written} does nothing here.`, mark.range, {
          sceneId,
          fixes: [removal(source, mark)],
        }),
      );
    } else if (mark.column === null) {
      out.push(
        problem(
          'column.unknown',
          'warning',
          `Unknown column «${mark.word}»: write principale or laterale. Until then this part prints where the template says.`,
          mark.range,
          { sceneId, fixes: [replaceWith(mark, 'main'), replaceWith(mark, 'side')] },
        ),
      );
    }
  };

  for (const section of model.sections) visit(section.heading, nightPartOf(section.role), section.mark);
  if (model.revelationsLabel) visit(template.overview.revelations, 'revelations', model.revelationsLabel.mark);
  for (const scene of model.scenes) {
    const sceneId = scene.id ?? undefined;
    for (const field of scene.fields) {
      const role = template.sceneFields.find((f) => f.label === field.label)?.role;
      visit(field.label, scenePartOf(role), field.mark, sceneId);
    }
    // A ### heading is never stripped: a known word in braces at its end is
    // printed as part of the title.
    const word = SCENE_TITLE_MARK.exec(scene.heading)?.[1];
    if (word && columnOfWord(word)) {
      out.push(
        problem(
          'column.ignored',
          'warning',
          `A scene heading takes no column: {${word}} is printed as part of the title.`,
          scene.headingRange,
          { sceneId },
        ),
      );
    }
  }
  return out;
};
