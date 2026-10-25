import { describe, expect, it } from 'vitest';
import {
  defineTemplate,
  templateChanges,
  templates,
  TemplateError,
  type AdventureTemplate,
  type AdventureTemplateInput,
  type CampaignTemplateInput,
} from '../src/index.js';

function copy(): AdventureTemplateInput {
  return JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
}

function edit(change: (t: AdventureTemplateInput) => void): AdventureTemplate {
  const definition = copy();
  change(definition);
  return defineTemplate(definition);
}

const from = templates.avventura;

describe('template schema additions', () => {
  it('accepts uids, a game system and the template it was copied from', () => {
    const template = edit((t) => {
      t.system = 'Kulthos';
      t.copiedFrom = 'Avventura';
      t.sections.push({ name: 'Atmosfera', requirement: 'optional', uid: 'u1' });
      t.sceneFields.push({ label: 'Odori', form: 'inline', requirement: 'optional', climax: false, uid: 'u2' });
      t.meta.push({ key: 'stagione', requirement: 'optional', type: 'text', uid: 'u3' });
      t.callouts.push({ ...t.callouts[2]!, type: 'mappa', label: 'Mappa', uid: 'u4' });
    });
    expect(template.system).toBe('Kulthos');
    expect(template.copiedFrom).toBe('Avventura');
    expect(template.sections.at(-1)?.uid).toBe('u1');
  });

  it('names a uid given twice', () => {
    const definition = copy();
    definition.sections.push(
      { name: 'Atmosfera', requirement: 'optional', uid: 'u1' },
      { name: 'Odori', requirement: 'optional', uid: 'u1' },
    );
    let error: unknown;
    try {
      defineTemplate(definition);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TemplateError);
    expect((error as TemplateError).issues).toEqual([`sections[${definition.sections.length - 1}]: duplicate uid "u1"`]);
  });
});

describe('templateChanges', () => {
  it('finds none between a template and itself', () => {
    expect(templateChanges(from, from)).toEqual([]);
    expect(templateChanges(templates.campagna, templates.campagna)).toEqual([]);
  });

  it('pairs a renamed section by its role', () => {
    const to = edit((t) => {
      t.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'changed', what: 'section', label: 'Apertura', before: 'Inizio forte', detail: 'renamed' },
    ]);
  });

  it('pairs a renamed section of the user by its uid', () => {
    const v2 = edit((t) => t.sections.push({ name: 'Atmosfera', requirement: 'optional', uid: 'u1' }));
    const v3 = edit((t) => t.sections.push({ name: 'Clima', requirement: 'optional', uid: 'u1' }));
    expect(templateChanges(v2, v3)).toEqual([
      { kind: 'changed', what: 'section', label: 'Clima', before: 'Atmosfera', detail: 'renamed' },
    ]);
  });

  it('tells two items with the same name and different uids apart', () => {
    const v2 = edit((t) => t.sections.push({ name: 'Atmosfera', requirement: 'optional', uid: 'u1' }));
    const v3 = edit((t) => t.sections.push({ name: 'Atmosfera', requirement: 'optional', uid: 'u2' }));
    expect(templateChanges(v2, v3)).toEqual([
      { kind: 'added', what: 'section', label: 'Atmosfera', after: 'optional' },
      { kind: 'removed', what: 'section', label: 'Atmosfera' },
    ]);
  });

  it('pairs a section without a role or uid by its name', () => {
    const v2 = edit((t) => t.sections.push({ name: 'Atmosfera', requirement: 'optional' }));
    const v3 = edit((t) => t.sections.push({ name: 'Atmosfera', requirement: 'required' }));
    expect(templateChanges(v2, v3)).toEqual([
      { kind: 'changed', what: 'section', label: 'Atmosfera', detail: 'requirement', before: 'optional', after: 'required' },
    ]);
  });

  it('lists added and removed rows', () => {
    const to = edit((t) => {
      const truths = t.sections.findIndex((s) => s.role === 'truths');
      t.sections.splice(truths + 1, 0, { name: 'Atmosfera', requirement: 'optional', uid: 'u1' });
      t.sections = t.sections.filter((s) => s.role !== 'rules');
      t.sceneFields.push({ label: 'Odori', form: 'inline', requirement: 'recommended', climax: false, uid: 'u2' });
      t.meta = t.meta.filter((k) => k.key !== 'linguetta');
      t.callouts.push({ ...t.callouts[2]!, type: 'mappa', label: 'Mappa', uid: 'u3' });
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'added', what: 'section', label: 'Atmosfera', after: 'optional' },
      { kind: 'removed', what: 'section', label: 'Regole della notte' },
      { kind: 'added', what: 'field', label: 'Odori', after: 'recommended' },
      { kind: 'added', what: 'box', label: 'Mappa' },
      { kind: 'removed', what: 'key', label: 'linguetta' },
    ]);
  });

  it('names a field made required, a form and a climax change', () => {
    const to = edit((t) => {
      const field = (label: string) => t.sceneFields.find((f) => f.label === label)!;
      field('Prove e regole').requirement = 'required';
      field('In gioco').form = 'block';
      field("Chi c'è").climax = true;
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'changed', what: 'field', label: 'In gioco', detail: 'form', before: 'inline', after: 'block' },
      { kind: 'changed', what: 'field', label: "Chi c'è", detail: 'climax', before: 'false', after: 'true' },
      { kind: 'changed', what: 'field', label: 'Prove e regole', detail: 'requirement', before: 'optional', after: 'required' },
    ]);
  });

  it('pairs a renamed field by its role', () => {
    const to = edit((t) => {
      t.sceneFields.find((f) => f.role === 'mustHave')!.label = 'Essenziale';
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'changed', what: 'field', label: 'Essenziale', before: 'Da non perdere qui', detail: 'renamed' },
    ]);
  });

  it("names a box's column, places and count", () => {
    const to = edit((t) => {
      const box = t.callouts.find((c) => c.type === 'documento')!;
      box.column = 'side';
      box.allowedIn = ['scene'];
      box.perPlace = { min: 1, max: 2 };
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'changed', what: 'box', label: 'Documento da consegnare', detail: 'column', before: 'main', after: 'side' },
      {
        kind: 'changed',
        what: 'box',
        label: 'Documento da consegnare',
        detail: 'places',
        before: 'scene, strongStart',
        after: 'scene',
      },
      { kind: 'changed', what: 'box', label: 'Documento da consegnare', detail: 'count', before: 'any', after: '1 to 2' },
    ]);
  });

  it("pairs a box by its uid when its type changes", () => {
    const v2 = edit((t) => t.callouts.push({ ...t.callouts[2]!, type: 'mappa', label: 'Mappa', uid: 'u1' }));
    const v3 = edit((t) => t.callouts.push({ ...t.callouts[2]!, type: 'pianta', label: 'Mappa', uid: 'u1' }));
    expect(templateChanges(v2, v3)).toEqual([
      { kind: 'changed', what: 'box', label: '[!pianta]', before: '[!mappa]', detail: 'renamed' },
    ]);
  });

  it("names a key's type and requirement", () => {
    const to = edit((t) => {
      const key = t.meta.find((k) => k.key === 'tempi')!;
      key.type = 'list';
      key.requirement = 'required';
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'changed', what: 'key', label: 'tempi', detail: 'requirement', before: 'optional', after: 'required' },
      { kind: 'changed', what: 'key', label: 'tempi', detail: 'type', before: 'text', after: 'list' },
    ]);
  });

  it('names a moved row, not the rows it passed', () => {
    const to = edit((t) => {
      const [antefatto] = t.sections.splice(1, 1);
      t.sections.splice(4, 0, antefatto!);
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'changed', what: 'section', label: 'Antefatto', detail: 'moved' },
    ]);
  });

  it('names each limit and the style that changed', () => {
    const to = edit((t) => {
      t.limits.synopsisWords = { min: 200, max: 500 };
      t.limits.reminders = 7;
      t.style.forbidden = [];
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'changed', what: 'limits', label: 'synopsisWords', before: '300 to 600', after: '200 to 500' },
      { kind: 'changed', what: 'limits', label: 'reminders', before: '5', after: '7' },
      { kind: 'changed', what: 'limits', label: 'style', before: 'em dash, en dash', after: 'none' },
    ]);
  });

  it('names the name and the game system', () => {
    const to = edit((t) => {
      t.name = 'Avventura Kulthos';
      t.system = 'Kulthos';
    });
    expect(templateChanges(from, to)).toEqual([
      { kind: 'changed', what: 'name', label: 'Avventura Kulthos', before: 'Avventura', detail: 'renamed' },
      { kind: 'changed', what: 'system', label: 'Kulthos', before: '', after: 'Kulthos' },
    ]);
  });

  it('counts a changed heading under the same name as a rename', () => {
    const to = edit((t) => {
      t.sections.find((s) => s.role === 'appendix')!.heading = 'Appendice: immagini';
    });
    expect(templateChanges(from, to)).toEqual([
      {
        kind: 'changed',
        what: 'section',
        label: 'Appendice: immagini',
        before: 'Appendice: immagini e musica',
        detail: 'renamed',
      },
    ]);
  });

  it('compares campaign templates by sections and keys', () => {
    const definition = JSON.parse(JSON.stringify(templates.campagna)) as CampaignTemplateInput;
    definition.sections.splice(4, 0, { name: 'Calendario', requirement: 'optional', uid: 'u1' });
    expect(templateChanges(templates.campagna, defineTemplate(definition))).toEqual([
      { kind: 'added', what: 'section', label: 'Calendario', after: 'optional' },
    ]);
  });
});
