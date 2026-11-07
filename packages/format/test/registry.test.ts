import { describe, expect, it } from 'vitest';
import {
  builtinTemplates,
  builtinVersions,
  defaultTemplateRef,
  defineTemplate,
  implicitTemplateRef,
  latestBuiltin,
  parseAdventure,
  resolveTemplate,
  sectionPdf,
  templates,
  type AdventureTemplateInput,
  type CampaignTemplateInput,
} from '../src/index.js';

describe('the registry', () => {
  it('lists avventura@1, campagna@1 and campagna@2', () => {
    expect(builtinTemplates.map((t) => `${t.id}@${t.version}`)).toEqual(['avventura@1', 'campagna@1', 'campagna@2']);
  });

  it('answers a built-in by id and version, exactly', () => {
    expect(resolveTemplate({ id: 'avventura', version: 1 })).toBe(templates.avventura);
    expect(resolveTemplate({ id: 'campagna', version: 1 })).toBe(templates.campagna);
    expect(resolveTemplate({ id: 'campagna', version: 2 })).toBe(templates.campagnaV2);
    expect(resolveTemplate({ id: 'campagna', version: 3 })).toBeUndefined();
  });

  it("answers a built-in id's versions, oldest first, and its latest", () => {
    expect(builtinVersions('campagna')).toEqual([templates.campagna, templates.campagnaV2]);
    expect(builtinVersions('avventura')).toEqual([templates.avventura]);
    expect(builtinVersions('saga')).toEqual([]);
    expect(latestBuiltin('campagna')).toBe(templates.campagnaV2);
    expect(latestBuiltin('avventura')).toBe(templates.avventura);
    expect(latestBuiltin('saga')).toBeUndefined();
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

  it('gives each kind its latest built-in as the default', () => {
    expect(defaultTemplateRef('adventure')).toEqual({ id: 'avventura', version: 1 });
    expect(defaultTemplateRef('campaign')).toEqual({ id: 'campagna', version: 2 });
  });

  it('reads a project that records no template as the first built-in of its kind', () => {
    expect(implicitTemplateRef('adventure')).toEqual({ id: 'avventura', version: 1 });
    expect(implicitTemplateRef('campaign')).toEqual({ id: 'campagna', version: 1 });
  });
});

describe('«Campagna» v2', () => {
  const v2 = templates.campagnaV2;

  it("has v1's front matter and thirteen optional sections, the appendix last", () => {
    expect(v2).toMatchObject({ id: 'campagna', version: 2, name: 'Campagna', kind: 'campaign' });
    expect(v2.meta).toEqual(templates.campagna.meta);
    expect(v2.sections.map((s) => s.heading ?? s.name)).toEqual([
      'Premessa',
      'Verità del mondo',
      'Fronti',
      'Fazioni',
      'PNG ricorrenti',
      'PG e agganci',
      'Archi',
      'Finali possibili',
      'Fili aperti',
      'Temi e motivi',
      'Prima della campagna',
      'Aggiornamenti',
      'Appendice: stile visivo e sonoro',
    ]);
    expect(v2.sections.every((s) => s.requirement === 'optional')).toBe(true);
    expect(v2.sections.map((s) => s.role ?? null)).toEqual([...Array<null>(12).fill(null), 'appendix']);
  });

  it('starts a page at Fronti, PNG ricorrenti, Archi and Fili aperti, and never prints the appendix', () => {
    const newPage = v2.sections.filter((s) => sectionPdf(s, 'campaign').newPage).map((s) => s.name);
    expect(newPage).toEqual(['Fronti', 'PNG ricorrenti', 'Archi', 'Fili aperti']);
    const left = v2.sections.filter((s) => !sectionPdf(s, 'campaign').print).map((s) => s.name);
    expect(left).toEqual(['Appendice']);
    expect(v2.sections.at(-1)!.pdf).toBeUndefined();
  });

  it('validates again from its own body', () => {
    expect(defineTemplate(JSON.parse(JSON.stringify(v2)) as CampaignTemplateInput)).toEqual(v2);
  });

  it('leaves v1 as it was', () => {
    expect(templates.campagna.sections.map((s) => s.name)).toEqual(['Premessa', 'Fronti', 'PNG ricorrenti', 'Fili aperti', 'Sessioni']);
    expect(templates.campagna.sections.some((s) => s.pdf || s.role)).toBe(false);
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
