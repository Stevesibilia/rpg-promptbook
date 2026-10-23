import { EditorState } from '@codemirror/state';
import { defineTemplate, templates, type AdventureTemplateInput } from 'promptbook-format';
import { skeletonDocument } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import {
  insertText,
  nextSceneNumber,
  placeInsert,
  readAloudAfter,
  readAloudOf,
  sceneAt,
  type Insert,
} from '../src/editor/inserts.js';
import { parse } from './analysed.js';

const template = templates.avventura;
const callout = (type: string, meta?: string) => template.callouts.find((c) => c.type === type && c.meta === meta)!;

// Applies an insert with the cursor at `pos` and returns the new text with
// a `|` where the cursor lands.
function run(text: string, what: Insert, pos: number, at?: { from: number; to: number }): string {
  const placed = placeInsert(what, { text, model: parse(text).model, template, pos, ...(at ? { at } : {}) });
  expect(placed).not.toBeNull();
  const doc = EditorState.create({ doc: text }).update({ changes: placed!.edit }).state.doc.toString();
  return `${doc.slice(0, placed!.cursor)}‸${doc.slice(placed!.cursor)}`;
}

const skeleton = skeletonDocument('adventure', {
  title: 'La prova',
  system: '',
  campaignTitle: null,
  author: '',
  copyright: '',
  licence: '',
});

describe('insertText', () => {
  it('writes each insert from the template', () => {
    const text = (what: Insert) => {
      const { text, cursor } = insertText(what, template);
      return `${text.slice(0, cursor)}‸${text.slice(cursor)}`;
    };
    expect(text({ kind: 'field', label: 'Prove e regole' })).toBe('**Prove e regole:** ‸');
    expect(text({ kind: 'field', label: 'Indizi qui' })).toBe('**Indizi qui**\n\n- ‸');
    expect(text({ kind: 'readAloud' })).toBe('> [!leggi]\n> ‸');
    expect(text({ kind: 'callout', callout: callout('documento') })).toBe('> [!documento] ‸\n> ');
    expect(text({ kind: 'callout', callout: callout('riquadro') })).toBe('> [!riquadro] ‸\n> ');
    expect(text({ kind: 'callout', callout: callout('riquadro', 'laterale') })).toBe('> [!riquadro|laterale] ‸\n> ');
    expect(text({ kind: 'sheetRef' })).toBe('→ Schede: ‸');
    expect(text({ kind: 'reactions' })).toBe('| Se i PG… | Allora… |\n| --- | --- |\n| ‸ |  |');
    expect(text({ kind: 'scene' })).toBe('### S1. ‸');
  });

  it('follows the mustHave role when a template renames the field', () => {
    const definition = JSON.parse(JSON.stringify(template)) as AdventureTemplateInput;
    definition.sceneFields.find((f) => f.role === 'mustHave')!.label = 'Imperdibile';
    expect(readAloudAfter(defineTemplate(definition))).toBe('Imperdibile');
  });

  it('places the read-aloud after the field with the mustHave role', () => {
    expect(readAloudAfter(template)).toBe('Da non perdere qui');
    expect(readAloudOf(template).type).toBe('leggi');
  });

  it('numbers a new scene after the highest one', () => {
    expect(nextSceneNumber(parse(sabaoth).model, template)).toBe(6);
    expect(nextSceneNumber(parse(skeleton).model, template)).toBe(2);
  });
});

describe('placeInsert in template order', () => {
  // S2 without «Prove e regole»: it sits between «Indizi qui» and «Se deragliano».
  const s2 = sabaoth.indexOf('### S2.');
  const label = sabaoth.indexOf('**Prove e regole:**', s2);
  const lineEnd = sabaoth.indexOf('\n', label);
  const without = sabaoth.slice(0, label) + sabaoth.slice(lineEnd + 2);

  it('puts a missing field after the last present field before it', () => {
    const out = run(without, { kind: 'field', label: 'Prove e regole' }, s2 + 20);
    const indizi = parse(without).model.scenes[1]!.fields.find((f) => f.label === 'Indizi qui')!;
    const end = indizi.range.end.offset;
    expect(out.slice(0, end)).toBe(without.slice(0, end));
    expect(out.slice(end, end + 25)).toBe('\n\n**Prove e regole:** ‸\n\n');
    // Everything after it is as it was.
    expect(out.slice(end + 25)).toBe(without.slice(end + 2));
    // And it reads back as the field, in its place.
    const fields = parse(out.replace('‸', '')).model.scenes[1]!.fields.map((f) => f.label);
    expect(fields.indexOf('Prove e regole')).toBe(fields.indexOf('Indizi qui') + 1);
  });

  it('puts a field missing at the end of the template after the last field', () => {
    const s1 = sabaoth.indexOf('### S1.');
    const out = run(sabaoth, { kind: 'field', label: 'Cosa decide la notte' }, s1);
    expect(out).toContain('resta nella casa la incontra dentro.\n\n**Cosa decide la notte:** ‸\n\n### S2.');
  });

  it('puts a field after the read-aloud box when it comes after its slot', () => {
    // S1 without «Cosa succede da sé»: it goes after the [!leggi] that
    // follows «Da non perdere qui».
    const s1 = sabaoth.indexOf('### S1.');
    const cosa = sabaoth.indexOf('**Cosa succede da sé**', s1);
    const chi = sabaoth.indexOf("**Chi c'è**", s1);
    const text = sabaoth.slice(0, cosa) + sabaoth.slice(chi);
    const out = run(text, { kind: 'field', label: 'Cosa succede da sé' }, s1);
    const box = parse(text).model.scenes[0]!.boxes.find((b) => b.kind === 'callout' && b.type === 'leggi')!;
    expect(out.slice(box.range.end.offset)).toMatch(/^\n\n\*\*Cosa succede da sé\*\*\n\n- ‸\n\n\*\*Chi c'è\*\*/);
  });

  it('fills an empty scene field by field, one blank line between each', () => {
    const at = skeleton.indexOf('### S1.');
    let text = skeleton;
    for (const label of ['In gioco', 'Luogo e momento', 'Da non perdere qui']) {
      text = run(text, { kind: 'field', label }, at).replace('‸', '');
    }
    text = run(text, { kind: 'readAloud' }, at);
    expect(text.slice(at)).toMatch(
      /^### S1\. Prima scena\n\n\*\*Luogo e momento:\*\* \n\n\*\*In gioco:\*\* \n\n\*\*Da non perdere qui\*\*\n\n- \n\n> \[!leggi\]\n> ‸\n\n## Indizi\n/,
    );
  });

  it('keeps one blank line where there were more', () => {
    const text = '## Scene\n\n### S1. Uno\n\n\n\n**In gioco:** chi.\n\n\n\n### S2. Due\n';
    expect(run(text, { kind: 'field', label: 'Luogo e momento' }, 12)).toBe(
      '## Scene\n\n### S1. Uno\n\n**Luogo e momento:** ‸\n\n**In gioco:** chi.\n\n\n\n### S2. Due\n',
    );
  });

  it('needs a scene for a field', () => {
    expect(
      placeInsert(
        { kind: 'field', label: 'In gioco' },
        { text: sabaoth, model: parse(sabaoth).model, template, pos: 0 },
      ),
    ).toBeNull();
    expect(sceneAt(parse(sabaoth).model, sabaoth.indexOf('## Indizi'))).toBe(-1);
  });
});

describe('placeInsert at the cursor', () => {
  const s3 = sabaoth.indexOf('### S3.');
  const inGioco = sabaoth.indexOf('**In gioco:**', s3);

  it('puts a callout after the cursor block', () => {
    const out = run(sabaoth, { kind: 'callout', callout: callout('documento') }, inGioco + 5);
    const end = sabaoth.indexOf('\n', inGioco);
    expect(out.slice(end, end + 25)).toBe('\n\n> [!documento] ‸\n> \n\n**');
  });

  it('puts the reactions table between two blocks when the cursor is on the blank line', () => {
    const blank = sabaoth.indexOf('\n', inGioco) + 1;
    const out = run(sabaoth, { kind: 'reactions' }, blank);
    expect(out.slice(blank - 1)).toMatch(
      /^\n\n\| Se i PG… \| Allora… \|\n\| --- \| --- \|\n\| ‸ \|  \|\n\n\*\*Da non perdere qui\*\*/,
    );
  });

  it('puts the references marker on the empty line, or on a new line', () => {
    const text = 'Riga uno.\n\n\nRiga due.\n';
    expect(run(text, { kind: 'sheetRef' }, 11)).toBe('Riga uno.\n\n→ Schede: ‸\nRiga due.\n');
    expect(run(text, { kind: 'sheetRef' }, 3)).toBe('Riga uno.\n→ Schede: ‸\n\n\nRiga due.\n');
    const placed = placeInsert({ kind: 'sheetRef' }, { text, model: parse(text).model, template, pos: 3 });
    expect(placed!.complete).toBe('sheets');
  });

  it('replaces the line it is given, for the / menu', () => {
    const text = '## Scene\n\n### S1. Uno\n\nTesto.\n/\n### S2. Due\n';
    const slash = text.indexOf('/');
    expect(run(text, { kind: 'scene' }, slash, { from: slash, to: slash + 1 })).toBe(
      '## Scene\n\n### S1. Uno\n\nTesto.\n\n### S3. ‸\n\n### S2. Due\n',
    );
    expect(run(text, { kind: 'field', label: 'In gioco' }, slash, { from: slash, to: slash + 1 })).toBe(
      '## Scene\n\n### S1. Uno\n\nTesto.\n\n**In gioco:** ‸\n\n### S2. Due\n',
    );
  });

  it('adds a new scene on the cursor line at the end of the text', () => {
    const text = '## Scene\n\n### S1. Uno\n\nTesto.\n\n';
    expect(run(text, { kind: 'scene' }, text.length)).toBe('## Scene\n\n### S1. Uno\n\nTesto.\n\n### S2. ‸\n');
  });
});
