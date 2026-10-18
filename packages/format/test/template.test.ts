import { describe, expect, it } from 'vitest';
import { defineTemplate, templateName, templates, TemplateError, type TemplateInput } from '../src/index.js';

function copy(): TemplateInput {
  return JSON.parse(JSON.stringify(templates.avventura)) as TemplateInput;
}

function failure(definition: unknown): TemplateError {
  try {
    defineTemplate(definition as TemplateInput);
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

  it('has the Kulthos grade table', () => {
    expect(template.systems).toEqual([
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

  it('names a bad requirement level and a bad grade', () => {
    const definition = copy() as unknown as {
      meta: { requirement: string }[];
      systems: { grades: { wounds: number }[] }[];
    };
    definition.meta[0]!.requirement = 'mandatory';
    definition.systems[0]!.grades[1]!.wounds = 0;
    const error = failure(definition);
    expect(error.issues.map((issue) => issue.split(':')[0])).toEqual([
      'meta[0].requirement',
      'systems[0].grades[1].wounds',
    ]);
  });

  it('rejects something that is not a definition', () => {
    expect(failure(null).message).toContain('(no id)');
  });
});
