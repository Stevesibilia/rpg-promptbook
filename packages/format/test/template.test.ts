import { describe, expect, it } from 'vitest';
import {
  builtinSystems,
  defineSystems,
  defineTemplate,
  templateName,
  templates,
  TemplateError,
  type AdventureTemplateInput,
  type SystemInput,
  type TemplateInput,
} from '../src/index.js';

function copy(): AdventureTemplateInput {
  return JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
}

function failure(definition: unknown, define: (d: never) => unknown = defineTemplate): TemplateError {
  try {
    define(definition as never);
  } catch (error) {
    if (error instanceof TemplateError) return error;
    throw error;
  }
  throw new Error('expected the definition to fail');
}

describe('shipped template', () => {
  const template = templates.avventura;

  it('loads as avventura@1', () => {
    expect(templateName(template)).toBe('avventura@1');
  });

  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(template))).toEqual(template);
  });

  it('lists the sections of the model in order, Antefatto and Regole della notte optional', () => {
    expect(template.sections.map((s) => s.name)).toEqual([
      'La vicenda in breve',
      'Antefatto',
      "A colpo d'occhio",
      'Da non perdere stasera',
      'Orologio',
      'Verità del mondo',
      'Inizio forte',
      'Mappa delle scene',
      'Regole della notte',
      'Scene',
      'Indizi',
      'PNG',
      'Schede',
      'Prima della sessione',
      'Appendice',
    ]);
    expect(template.sections.filter((s) => s.requirement === 'optional').map((s) => s.name)).toEqual([
      'Antefatto',
      'Regole della notte',
      'Schede',
      'Prima della sessione',
    ]);
  });

  it('gives each scene field its requirement level', () => {
    const level = (requirement: string) =>
      template.sceneFields.filter((f) => f.requirement === requirement).map((f) => f.label);
    expect(level('required')).toEqual([
      'Luogo e momento',
      'In gioco',
      'Da non perdere qui',
      'Cosa succede da sé',
      'Se deragliano',
    ]);
    expect(level('recommended')).toEqual(['Indizi qui']);
    expect(level('optional')).toEqual([
      "Chi c'è",
      'Prove e regole',
      'Regole della situazione',
      'Cosa decide la notte',
    ]);
    expect(template.sceneFields.filter((f) => f.climax).map((f) => f.label)).toEqual([
      'Regole della situazione',
      'Cosa decide la notte',
    ]);
  });

  it('has the four callout types', () => {
    expect(template.callouts.map((c) => (c.meta ? `${c.type}|${c.meta}` : c.type))).toEqual([
      'leggi',
      'documento',
      'riquadro',
      'riquadro|laterale',
    ]);
  });

  it('gives a role to every section and scene field the code finds', () => {
    expect(template.sections.map((s) => [s.name, s.role])).toEqual([
      ['La vicenda in breve', 'synopsis'],
      ['Antefatto', 'backstory'],
      ["A colpo d'occhio", 'overview'],
      ['Da non perdere stasera', 'reminders'],
      ['Orologio', 'clock'],
      ['Verità del mondo', 'truths'],
      ['Inizio forte', 'strongStart'],
      ['Mappa delle scene', 'sceneMap'],
      ['Regole della notte', 'rules'],
      ['Scene', 'scenes'],
      ['Indizi', 'clues'],
      ['PNG', 'npcs'],
      ['Schede', 'sheets'],
      ['Prima della sessione', 'before'],
      ['Appendice', 'appendix'],
    ]);
    expect(template.sceneFields.map((f) => [f.label, f.role])).toEqual([
      ['Luogo e momento', 'place'],
      ['In gioco', 'inPlay'],
      ['Da non perdere qui', 'mustHave'],
      ['Cosa succede da sé', 'happens'],
      ["Chi c'è", 'cast'],
      ['Indizi qui', 'clues'],
      ['Prove e regole', 'tests'],
      ['Se deragliano', 'derail'],
      ['Regole della situazione', 'situation'],
      ['Cosa decide la notte', 'decides'],
    ]);
  });

  it('holds no game system', () => {
    expect(template).not.toHaveProperty('systems');
  });
});

describe('built-in systems', () => {
  it('has the Kulthos grade table', () => {
    expect(builtinSystems).toEqual([
      {
        name: 'Kulthos',
        woundsPerCounter: 3,
        grades: [
          { name: 'Ordinaria', wounds: 3, afflictions: 1 },
          { name: 'Straordinaria', wounds: 6, afflictions: 2 },
          { name: 'Leggendaria', wounds: 9, afflictions: 3 },
        ],
      },
    ]);
  });

});

describe('shipped template, limits', () => {
  const template = templates.avventura;

  it('has the limits and the forbidden dashes', () => {
    expect(template.limits).toEqual({ synopsisWords: { min: 300, max: 600 }, preambleWords: 700,
      reminders: 5,
      revelationClues: 3,
      revelationScenes: 2,
    });
    expect(template.style.forbidden.map((f) => f.text)).toEqual(['—', '–']);
  });
});

describe('defineTemplate', () => {
  it('returns a valid definition unchanged', () => {
    expect(defineTemplate(copy())).toEqual(templates.avventura);
  });

  it('names a scene field without a label', () => {
    const definition = copy();
    const field = definition.sceneFields[3];
    if (!field) throw new Error('fixture');
    field.label = '';
    const error = failure(definition);
    expect(error.message).toContain('"avventura@1"');
    expect(error.message).toContain('sceneFields[3].label');
    expect(error.issues).toHaveLength(1);
  });

  it('names a missing label', () => {
    const definition = copy() as unknown as { sceneFields: Record<string, unknown>[] };
    delete definition.sceneFields[0]?.['label'];
    expect(failure(definition).message).toContain('sceneFields[0].label');
  });

  it('names a duplicate section', () => {
    const definition = copy();
    definition.sections.push({ name: 'Scene', requirement: 'optional' });
    expect(failure(definition).message).toContain('sections[15]: duplicate section "Scene"');
  });

  it('names a bad requirement level', () => {
    const definition = copy() as unknown as { meta: { requirement: string }[] };
    definition.meta[0]!.requirement = 'mandatory';
    const error = failure(definition);
    expect(error.issues.map((issue) => issue.split(':')[0])).toEqual(['meta[0].requirement']);
  });

  it('names a role given twice, sections and scene fields alike', () => {
    const definition = copy();
    definition.sections[1]!.role = 'clock';
    definition.sceneFields[0]!.role = 'mustHave';
    expect(failure(definition).issues).toEqual([
      'sections[4]: duplicate role "clock"',
      'sceneFields[2]: duplicate role "mustHave"',
    ]);
  });

  it('accepts a template that lacks a role', () => {
    const definition = copy();
    delete definition.sceneFields[2]!.role;
    expect(defineTemplate(definition).sceneFields[2]).not.toHaveProperty('role');
  });

  it('names a kind it does not know', () => {
    const definition = { ...copy(), kind: 'saga' };
    expect(failure(definition).issues.map((issue) => issue.split(':')[0])).toEqual(['kind']);
  });

  it('keeps only what a campaign needs in a campaign template', () => {
    const campaign = defineTemplate({ ...copy(), id: 'altra', kind: 'campaign' } as TemplateInput);
    expect(Object.keys(campaign).sort()).toEqual(['id', 'kind', 'meta', 'name', 'sections', 'version']);
  });

  it('rejects something that is not a definition', () => {
    expect(failure(null).message).toContain('(no id)');
  });
});

describe('campaign template', () => {
  const template = templates.campagna;

  it('loads as campagna@1, a campaign, plain JSON', () => {
    expect(templateName(template)).toBe('campagna@1');
    expect(template.kind).toBe('campaign');
    expect(JSON.parse(JSON.stringify(template))).toEqual(template);
  });

  it('lists the front matter keys and the sections of a campaign skeleton', () => {
    expect(template.meta.map((k) => k.key)).toEqual(['titolo', 'sistema', 'formato', 'autore', 'copyright', 'licenza']);
    expect(template.sections.map((s) => [s.name, s.requirement, s.role])).toEqual([
      ['Premessa', 'optional', undefined],
      ['Fronti', 'optional', undefined],
      ['PNG ricorrenti', 'optional', undefined],
      ['Fili aperti', 'optional', undefined],
      ['Sessioni', 'optional', undefined],
    ]);
  });
});

describe('defineSystems', () => {
  const kulthos = (): SystemInput[] => JSON.parse(JSON.stringify(builtinSystems)) as SystemInput[];

  it('returns a valid list unchanged', () => {
    expect(defineSystems(kulthos())).toEqual(builtinSystems);
  });

  it('names a bad grade', () => {
    const systems = kulthos();
    systems[0]!.grades[1]!.wounds = 0;
    expect(failure(systems, defineSystems).issues.map((issue) => issue.split(':')[0])).toEqual(['[0].grades[1].wounds']);
  });

  it('names a system or a grade given twice', () => {
    const systems = kulthos();
    systems[0]!.grades[2]!.name = 'Ordinaria';
    systems.push(kulthos()[0]!);
    expect(failure(systems, defineSystems).issues).toEqual([
      '[1]: duplicate system "Kulthos"',
      '[0].grades[2]: duplicate grade "Ordinaria"',
    ]);
  });
});
