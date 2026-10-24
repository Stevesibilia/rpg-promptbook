import { describe, expect, it } from 'vitest';
import {
  builtinTemplates,
  defaultTemplateRef,
  defineTemplate,
  parseAdventure,
  resolveTemplate,
  templates,
  type AdventureTemplateInput,
} from '../src/index.js';

describe('the registry', () => {
  it('lists avventura@1 and campagna@1', () => {
    expect(builtinTemplates.map((t) => `${t.id}@${t.version}`)).toEqual(['avventura@1', 'campagna@1']);
  });

  it('answers a built-in by id and version', () => {
    expect(resolveTemplate({ id: 'avventura', version: 1 })).toBe(templates.avventura);
    expect(resolveTemplate({ id: 'campagna', version: 1 })).toBe(templates.campagna);
  });

  it('answers none for an unknown id or version', () => {
    expect(resolveTemplate({ id: 'avventura', version: 2 })).toBeUndefined();
    expect(resolveTemplate({ id: 'saga', version: 1 })).toBeUndefined();
  });

  it('looks in the extra templates first', () => {
    const own = defineTemplate({ ...(JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput), name: 'Mia' });
    expect(resolveTemplate({ id: 'avventura', version: 1 }, [own])).toBe(own);
    expect(resolveTemplate({ id: 'campagna', version: 1 }, [own])).toBe(templates.campagna);
  });

  it('gives each kind its built-in as the default', () => {
    expect(defaultTemplateRef('adventure')).toEqual({ id: 'avventura', version: 1 });
    expect(defaultTemplateRef('campaign')).toEqual({ id: 'campagna', version: 1 });
  });
});

describe('a renamed field keeps its role', () => {
  const scene = (mustHave: string) =>
    [
      '---',
      'titolo: Prova',
      '---',
      '',
      '## Scene',
      '',
      '### S1. La porta',
      '',
      '**Luogo e momento:** il molo, di notte.',
      '',
      '**In gioco:** la porta.',
      '',
      `**${mustHave}**`,
      '',
      '- la chiave sotto la soglia',
      '',
      '**Cosa succede da sé**',
      '',
      '- la marea sale',
      '',
      '**Se deragliano:** la porta si chiude.',
      '',
    ].join('\n');

  it('reads «Imperdibile» as the mustHave field of a template that renames it', () => {
    const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
    definition.sceneFields.find((f) => f.role === 'mustHave')!.label = 'Imperdibile';
    const template = defineTemplate(definition);
    const renamed = parseAdventure(scene('Imperdibile'), { template });
    const original = parseAdventure(scene('Da non perdere qui'), { template: templates.avventura });

    const field = renamed.model.scenes[0]!.fields.find((f) => f.label === 'Imperdibile')!;
    expect(field).toMatchObject({ known: true, form: 'block' });
    expect(field.blocks.map((b) => b.kind)).toEqual(['list']);
    expect(template.sceneFields.find((f) => f.role === 'mustHave')!.label).toBe(field.label);
    expect(renamed.problems.map((p) => p.code)).toEqual(original.problems.map((p) => p.code));
  });
});
