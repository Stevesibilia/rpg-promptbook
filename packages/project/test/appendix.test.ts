import { parseAdventure, templates, type TextEdit } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { appendixEdit } from '../src/index.js';

const parse = (text: string) => parseAdventure(text, { template: templates.avventura }).model;
const apply = (text: string, edit: TextEdit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to);

const SCENES = `# L'Ancora di Sabaoth

## Scene

### S1. La casa che cede

Testo.

### S2. L'ordine di Donato

Altro.

### Senza id

### S1. La casa che cede, di nuovo
`;

const ROWS = `### S1. La casa che cede

visual:

mood:

### S2. L'ordine di Donato

visual:

mood:
`;

describe('appendixEdit', () => {
  it('adds the heading and one row per scene at the end of a document with no appendix', () => {
    const edit = appendixEdit(SCENES, parse(SCENES))!;
    expect(edit).toMatchObject({ from: SCENES.length, to: SCENES.length });
    const text = apply(SCENES, edit);
    expect(text).toBe(`${SCENES}\n## Appendice: immagini e musica\n\n${ROWS}`);
    expect(parse(text).appendix.map((r) => [r.sceneId, r.visual?.text, r.mood?.text])).toEqual([
      ['S1', '', ''],
      ['S2', '', ''],
    ]);
  });

  it('starts on a line of its own when the document has no final line break', () => {
    const text = apply(SCENES.trimEnd(), appendixEdit(SCENES.trimEnd(), parse(SCENES.trimEnd()))!);
    expect(text).toBe(`${SCENES}\n## Appendice: immagini e musica\n\n${ROWS}`);
  });

  it('adds the rows to an empty appendix, before the next section', () => {
    const before = `${SCENES}\n## Appendice: immagini e musica\n\n## Dopo\n\nFine.\n`;
    const text = apply(before, appendixEdit(before, parse(before))!);
    expect(text).toBe(`${SCENES}\n## Appendice: immagini e musica\n\n${ROWS}\n## Dopo\n\nFine.\n`);
    expect(parse(text).appendix.map((r) => r.sceneId)).toEqual(['S1', 'S2']);
  });

  it('adds the rows to an empty appendix at the end', () => {
    const before = `${SCENES}\n## Appendice: immagini e musica\n`;
    expect(apply(before, appendixEdit(before, parse(before))!)).toBe(`${before}\n${ROWS}`);
  });

  it('writes the heading alone in a document with no scenes', () => {
    const text = '# Vuoto\n';
    expect(apply(text, appendixEdit(text, parse(text))!)).toBe('# Vuoto\n\n## Appendice: immagini e musica\n');
  });

  it('adds nothing to an appendix that has rows', () => {
    const text = `${SCENES}\n## Appendice: immagini e musica\n\n${ROWS}`;
    expect(appendixEdit(text, parse(text))).toBeNull();
  });
});
