import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { parseAdventure, templates, withColumn, type AdventureTemplate } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { markdownWithTables } from '../src/editor/cm/language.js';
import { focusedField, inlineItems, previewConfigOf, type PreviewItem } from '../src/editor/cm/preview.js';
import { columnEdit, columnTarget, columnTargetOf } from '../src/editor/columns.js';
import { insertText, placeInsert } from '../src/editor/inserts.js';
import { outlineOf } from '../src/editor/outline.js';
import { paletteEntries } from '../src/editor/palette.js';
import { syntaxOf } from '../src/editor/syntax.js';
import { analysed, campaign } from './analysed.js';

// The column marks in the project's editor (template-placement design
// decision A9): their look, the inserts, the palette's two commands and the
// syntax sheet.

const template = templates.avventura;

const doc = [
  '---',
  'titolo: La lanterna',
  '---',
  '',
  "## A colpo d'occhio",
  '',
  'Un porto, una notte.',
  '',
  '**Rivelazioni** {principale}',
  '',
  '- **R1.** La lanterna è spenta da anni. (I1, I2, I3)',
  '- **R2.** Il guardiano mente. (I4, I5, I6)',
  '',
  '## Da non perdere stasera {laterale}',
  '',
  '- La campana suona da sola.',
  '',
  '## Orologio',
  '',
  '- La marea sale.',
  '',
  '## Verità del mondo {latterale}',
  '',
  '- Il faro è chiuso.',
  '',
  '## Indizi {laterale}',
  '',
  '## Scene',
  '',
  '### S1. Il molo',
  '',
  '**Luogo e momento:** Molo vecchio, alba.',
  '',
  '**Da non perdere qui** {laterale}',
  '',
  '- Le reti tagliate.',
  '',
  "**Chi c'è**",
  '',
  '- Nunzio, pescatore.',
  '',
  '**In gioco:** {laterale}',
  '',
].join('\n');

const at = (needle: string, offset = 0) => {
  const index = doc.indexOf(needle);
  if (index < 0) throw new Error(`not found: ${needle}`);
  return index + offset;
};

function previewState(text: string, cursor: number, focused: boolean): EditorState {
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdownWithTables(), focusedField.init(() => focused)],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

// The marks the preview draws, as «text:class».
const marks = (state: EditorState, checked = true) =>
  inlineItems(state, [{ from: 0, to: state.doc.length }], previewConfigOf(template, checked))
    .filter((i): i is Extract<PreviewItem, { kind: 'mark' }> => i.kind === 'mark')
    .map((i) => `${state.sliceDoc(i.from, i.to)}:${i.className}`);
const hidden = (state: EditorState) =>
  inlineItems(state, [{ from: 0, to: state.doc.length }], previewConfigOf(template, true))
    .filter((i) => i.kind === 'hide')
    .map((i) => state.sliceDoc(i.from, (i as { to: number }).to));

describe('the column marks in the preview', () => {
  it('show after a heading and a label on every line, the label keeping its look', () => {
    for (const [cursor, focused] of [
      [0, false],
      [at('## Orologio'), true],
      [at('{laterale}', 1), true],
      [at('**Da non perdere qui**', 3), true],
    ] as const) {
      const shown = marks(previewState(doc, cursor, focused));
      expect(shown).toEqual(
        expect.arrayContaining([
          '{principale}:cm-pm',
          '**Rivelazioni**:cm-fl',
          '{laterale}:cm-pm',
          '{latterale}:cm-pm cm-pm-bad',
          '**Da non perdere qui**:cm-fl',
        ]),
      );
      // Never hidden, on or off the active line.
      expect(hidden(previewState(doc, cursor, focused)).some((h) => h.includes('{'))).toBe(false);
    }
  });

  it('hides the heading marks around it off the active line', () => {
    const state = previewState(doc, 0, false);
    const off = hidden(state);
    expect(off.filter((h) => h === '## ').length).toBeGreaterThan(3);
    expect(marks(state).filter((m) => m.startsWith('{')).length).toBe(5);
  });

  it('marks a heading closed with #, and leaves inline fields, list items and ### alone', () => {
    const text = [
      '## Orologio {laterale} ##',
      '',
      '**In gioco:** {laterale}',
      '',
      '**Chi c’è** {laterale} poi testo',
      '',
      '- **R1.** {laterale}',
      '',
      '### S1. Il molo {laterale}',
      '',
      '## {laterale}',
      '',
      '## Orologio \\{laterale}',
      '',
      '**Indizi qui** {laterale}',
      'e ancora testo',
      '',
    ].join('\n');
    expect(marks(previewState(text, 0, false)).filter((m) => m.includes('cm-pm'))).toEqual(['{laterale}:cm-pm']);
  });

  it('shows braces as text in a campaign', () => {
    expect(marks(previewState(doc, 0, false), false).filter((m) => m.includes('cm-pm'))).toEqual([]);
  });
});

describe('inserting a field', () => {
  const text = (t: AdventureTemplate, label: string) => insertText({ kind: 'field', label }, t).text;

  it('writes the template’s column after the label of the four block fields', () => {
    expect(text(template, 'Da non perdere qui')).toBe('**Da non perdere qui** {laterale}\n\n- ');
    expect(text(template, 'Cosa succede da sé')).toBe('**Cosa succede da sé** {principale}\n\n- ');
    expect(text(template, "Chi c'è")).toBe("**Chi c'è** {laterale}\n\n- ");
    expect(text(template, 'Indizi qui')).toBe('**Indizi qui** {principale}\n\n- ');
    const moved = withColumn(template, 'cast', 'main');
    expect(text(moved, "Chi c'è")).toBe("**Chi c'è** {principale}\n\n- ");
  });

  it('writes no mark on an inline field or a block field without a column', () => {
    expect(text(template, 'In gioco')).toBe('**In gioco:** ');
    expect(text(template, 'Regole della situazione')).toBe('**Regole della situazione**\n\n- ');
    const inline = {
      ...template,
      sceneFields: template.sceneFields.map((f) => (f.role === 'cast' ? { ...f, form: 'inline' as const } : f)),
    };
    expect(text(inline, "Chi c'è")).toBe("**Chi c'è:** ");
  });

  it('finds a marked field: no second copy, and the next one goes after its list', () => {
    const model = parseAdventure(doc, { template }).model;
    const scene = model.scenes[0]!;
    expect(scene.fields.find((f) => f.label === 'Da non perdere qui')).toMatchObject({ known: true, form: 'block' });
    const placed = placeInsert({ kind: 'field', label: 'Cosa succede da sé' }, { text: doc, model, template, pos: at('### S1') });
    const out = doc.slice(0, placed!.edit.from) + placed!.edit.insert + doc.slice(placed!.edit.to);
    expect(out).toContain('**Da non perdere qui** {laterale}\n\n- Le reti tagliate.\n\n**Cosa succede da sé** {principale}\n\n- \n\n**Chi c\'è**');
  });
});

describe('the part under the cursor', () => {
  const model = parseAdventure(doc, { template }).model;
  const target = (pos: number) => columnTarget(model, template, doc, pos);
  const after = (pos: number, to: 'main' | 'side') => {
    const t = target(pos)!;
    const edit = columnEdit(t, to);
    return doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
  };
  const line = (text: string, start: string) => text.split('\n').find((l) => l.startsWith(start));

  it('is the section, the field from its label to its list, or the revelations', () => {
    expect(target(at('- La marea sale.'))).toMatchObject({ part: 'clock', column: 'main', mark: null });
    expect(target(at('## Orologio'))).toMatchObject({ part: 'clock' });
    expect(target(at('- La campana'))).toMatchObject({ part: 'reminders', column: 'side' });
    expect(target(at('- Il faro'))).toMatchObject({ part: 'truths', column: 'main', mark: { word: 'latterale' } });
    expect(target(at('**Rivelazioni**'))).toMatchObject({ part: 'revelations', column: 'main' });
    expect(target(at('- **R2.**', 4))).toMatchObject({ part: 'revelations', column: 'main' });
    expect(target(at('**Da non perdere qui**'))).toMatchObject({ part: 'mustHave', column: 'side' });
    expect(target(at('- Le reti'))).toMatchObject({ part: 'mustHave', column: 'side' });
    expect(target(at('- Nunzio'))).toMatchObject({ part: 'cast', column: 'side', mark: null });
  });

  it('is nothing in a part that takes no column', () => {
    expect(target(at('Un porto'))).toBeNull();
    expect(target(at('## Indizi'))).toBeNull();
    expect(target(at('**Luogo e momento'))).toBeNull();
    expect(target(at('**In gioco'))).toBeNull();
    expect(target(at('titolo'))).toBeNull();
  });

  it('writes the mark, or replaces the one there, unknown words included', () => {
    expect(line(after(at('- La marea'), 'side'), '## Orologio')).toBe('## Orologio {laterale}');
    expect(line(after(at('- Le reti'), 'main'), '**Da non perdere qui')).toBe('**Da non perdere qui** {principale}');
    expect(line(after(at('- Il faro'), 'side'), '## Verità')).toBe('## Verità del mondo {laterale}');
    expect(line(after(at('- Nunzio'), 'main'), "**Chi c'è")).toBe("**Chi c'è** {principale}");
    expect(line(after(at('- **R1.**'), 'side'), '**Rivelazioni')).toBe('**Rivelazioni** {laterale}');
  });

  it('writes before a closing run of #', () => {
    const text = '## Orologio ##\n\n- La marea.\n';
    const t = columnTarget(parseAdventure(text, { template }).model, template, text, 3)!;
    const edit = columnEdit(t, 'side');
    expect(text.slice(0, edit.from) + edit.insert + text.slice(edit.to)).toBe('## Orologio {laterale} ##\n\n- La marea.\n');
  });

  it('is not the revelations when their label has a colon or text after it', () => {
    for (const label of ['**Rivelazioni:**', '**Rivelazioni** e altro']) {
      const text = `## A colpo d'occhio\n\n${label}\n\n- **R1.** Una. (I1)\n`;
      const parsed = parseAdventure(text, { template }).model;
      expect(columnTarget(parsed, template, text, text.indexOf('**R1'))).toBeNull();
      expect(columnTarget(parsed, template, text, text.indexOf(label))).toBeNull();
    }
  });

  it('follows the template when there is no mark', () => {
    const moved = withColumn(template, 'clock', 'side');
    const parsed = parseAdventure(doc, { template: moved }).model;
    expect(columnTarget(parsed, moved, doc, at('- La marea'))).toMatchObject({ column: 'side' });
  });

  it('is read from the editor’s state, and is nothing in a campaign', () => {
    expect(columnTargetOf(analysed(doc, at('- La marea')).state)).toMatchObject({ part: 'clock' });
    expect(columnTargetOf(campaign(doc, at('- La marea')))).toBeNull();
  });
});

describe('the palette', () => {
  const entries = (cursor: number, checked = true) => {
    const { state } = analysed(doc, cursor);
    const column = columnTargetOf(state)?.column ?? null;
    return paletteEntries(outlineOf(state), { checked, printable: true, column })
      .filter((e) => e.action.kind === 'column')
      .map((e) => [e.label, e.action]);
  };

  it('offers the move to the other column, first, for the part under the cursor', () => {
    expect(entries(at('- La marea'))).toEqual([['Move to side column', { kind: 'column', to: 'side' }]]);
    expect(entries(at('- Le reti'))).toEqual([['Move to main column', { kind: 'column', to: 'main' }]]);
    expect(entries(at('- **R2.**'))).toEqual([['Move to side column', { kind: 'column', to: 'side' }]]);
    const { state } = analysed(doc, at('- La marea'));
    expect(paletteEntries(outlineOf(state), { checked: true, printable: true, column: 'main' })[0]!.label).toBe(
      'Move to side column',
    );
  });

  it('lists neither command elsewhere', () => {
    expect(entries(at('## Indizi'))).toEqual([]);
    expect(entries(at('Un porto'))).toEqual([]);
    expect(paletteEntries([], { checked: true, printable: true }).some((e) => e.action.kind === 'column')).toBe(false);
  });
});

describe('the syntax sheet', () => {
  it('lists the two marks and the parts that take one', () => {
    const group = syntaxOf(template).find((g) => g.title.startsWith('Columns'))!;
    expect(group.title).toBe(
      "Columns, for Rivelazioni, Da non perdere stasera, Orologio, Verità del mondo, Da non perdere qui, Cosa succede da sé, Chi c'è, Indizi qui",
    );
    expect(group.rows.map((r) => [r.syntax, r.name, r.note])).toEqual([
      ['{principale}', 'Main column', "after a ## heading or a block field's label: prints the part in that column, whatever the template says"],
      ['{laterale}', 'Side column', "after a ## heading or a block field's label: prints the part in that column, whatever the template says"],
    ]);
  });
});
