import { defineTemplate, templates, type AdventureTemplateInput, type CampaignTemplateInput, type TextEdit } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { updateEdits } from '../src/index.js';
import { fixture } from './helpers.js';

const apply = (text: string, edits: TextEdit[]) =>
  [...edits].sort((a, b) => b.from - a.from).reduce((out, e) => out.slice(0, e.from) + e.insert + out.slice(e.to), text);

const sabaoth = fixture('l-ancora-di-sabaoth.converted.md');

function own(version: number, change: (t: AdventureTemplateInput) => void = () => {}) {
  const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  definition.id = 't-kulthos0001';
  definition.version = version;
  change(definition);
  return defineTemplate(definition);
}

// v2 as the project has it; v3 renames the strong start and «Da non perdere
// qui», and adds «Atmosfera» after «Verità del mondo».
const v2 = own(2);
const v3 = own(3, (t) => {
  t.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
  const truths = t.sections.findIndex((s) => s.role === 'truths');
  t.sections.splice(truths + 1, 0, { name: 'Atmosfera', requirement: 'optional', uid: 'u1' });
  t.sceneFields.find((f) => f.role === 'mustHave')!.label = 'Essenziale';
});

describe('updateEdits', () => {
  it('renames the strong start and adds the new section after «Verità del mondo» on Sabaoth', () => {
    const text = apply(sabaoth, updateEdits(sabaoth, v2, v3, { addSections: true, renameHeadings: true }));
    expect(text).not.toContain('## Inizio forte');
    expect(text).toContain('\n## Atmosfera\n\n## Apertura\n\n> [!leggi]\n');
    const truths = text.indexOf('## Verità del mondo');
    expect(text.indexOf('## Atmosfera')).toBeGreaterThan(truths);
    expect(text.indexOf('- **Neri.** Ha scoperto il furto solo ieri sera, e ha scritto a Salvi.\n\n## Atmosfera')).toBeGreaterThan(0);
    const scenes = (sabaoth.match(/\*\*Da non perdere qui\*\*/g) ?? []).length;
    expect(scenes).toBeGreaterThan(1);
    expect(text).not.toContain('**Da non perdere qui**');
    expect((text.match(/\*\*Essenziale\*\*/g) ?? []).length).toBe(scenes);
    // Only these lines change.
    expect(text.length - sabaoth.length).toBe(
      '\n\n## Atmosfera'.length + ('Apertura'.length - 'Inizio forte'.length) + scenes * ('Essenziale'.length - 'Da non perdere qui'.length),
    );
  });

  it('does only what is ticked', () => {
    const renames = apply(sabaoth, updateEdits(sabaoth, v2, v3, { addSections: false, renameHeadings: true }));
    expect(renames).toContain('## Apertura');
    expect(renames).not.toContain('## Atmosfera');
    const added = apply(sabaoth, updateEdits(sabaoth, v2, v3, { addSections: true, renameHeadings: false }));
    expect(added).toContain('## Inizio forte');
    expect(added).toContain('\n## Atmosfera\n\n## Inizio forte\n');
    expect(updateEdits(sabaoth, v2, v3, { addSections: false, renameHeadings: false })).toEqual([]);
  });

  it('answers no edits between two versions with the same sections and fields', () => {
    const v4 = own(4, (t) => {
      t.limits.reminders = 7;
    });
    expect(updateEdits(sabaoth, v2, v4, { addSections: true, renameHeadings: true })).toEqual([]);
  });

  it('places an added section before the first heading when no earlier section is there', () => {
    const v4 = own(4, (t) => {
      t.sections.unshift({ name: 'Premessa', requirement: 'optional', uid: 'u2' });
    });
    const text = apply(sabaoth, updateEdits(sabaoth, v2, v4, { addSections: true, renameHeadings: true }));
    expect(text).toContain("\n## Premessa\n\n## A colpo d'occhio\n");
  });

  it('places added sections after a renamed one, in template order', () => {
    const v4 = own(4, (t) => {
      const start = t.sections.find((s) => s.role === 'strongStart')!;
      start.name = 'Apertura';
      const at = t.sections.indexOf(start);
      t.sections.splice(at + 1, 0, { name: 'Uno', requirement: 'optional', uid: 'u3' }, { name: 'Due', requirement: 'optional', uid: 'u4' });
    });
    const text = apply(sabaoth, updateEdits(sabaoth, v2, v4, { addSections: true, renameHeadings: true }));
    expect(text).toMatch(/## Apertura\n[\s\S]*?\n\n## Uno\n\n## Due\n\n## Mappa delle scene\n/);
  });

  it('renames a heading that says more than the name and keeps the rest', () => {
    const v4 = own(4, (t) => {
      t.sections.find((s) => s.role === 'appendix')!.heading = 'Appendice: immagini, musica';
    });
    const text = apply(sabaoth, updateEdits(sabaoth, v2, v4, { addSections: true, renameHeadings: true }));
    expect(text).toContain('\n## Appendice: immagini, musica\n');
  });

  it("updates a campaign's headings without parsing it", () => {
    // A duplicate's sections carry uids, so a section without a role pairs
    // across a rename.
    const v1 = JSON.parse(JSON.stringify(templates.campagna)) as CampaignTemplateInput;
    v1.id = 't-lunga000001';
    v1.sections.forEach((s, i) => (s.uid = `s${i}`));
    const definition = JSON.parse(JSON.stringify(v1)) as CampaignTemplateInput;
    definition.version = 2;
    definition.sections.find((s) => s.name === 'Fronti')!.name = 'Minacce';
    definition.sections.splice(4, 0, { name: 'Calendario', requirement: 'optional', uid: 'u1' });
    const from = defineTemplate(v1);
    const to = defineTemplate(definition);
    const text = '---\ntitolo: Apocrypha\n---\n\n## Premessa\n\n## Fronti\n\nLa Chiesa.\n\n## PNG ricorrenti\n\n## Fili aperti\n\n## Sessioni\n';
    expect(apply(text, updateEdits(text, from, to, { addSections: true, renameHeadings: true }))).toBe(
      '---\ntitolo: Apocrypha\n---\n\n## Premessa\n\n## Minacce\n\nLa Chiesa.\n\n## PNG ricorrenti\n\n## Fili aperti\n\n## Calendario\n\n## Sessioni\n',
    );
  });

  it('appends an added section at the end when it is the last one', () => {
    const definition = JSON.parse(JSON.stringify(templates.campagna)) as CampaignTemplateInput;
    definition.sections.push({ name: 'Epilogo', requirement: 'optional', uid: 'u1' });
    definition.version = 2;
    const text = '## Premessa\n\nTesto.\n\n## Sessioni\n';
    expect(apply(text, updateEdits(text, templates.campagna, defineTemplate(definition), { addSections: true, renameHeadings: true }))).toBe(
      '## Premessa\n\nTesto.\n\n## Sessioni\n\n## Epilogo\n',
    );
  });
});
