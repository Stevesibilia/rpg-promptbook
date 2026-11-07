import { defineTemplate, templates, type AdventureTemplateInput } from 'promptbook-format';
import { defaultSettings, templateOf } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import type { StoredTemplate } from '../src/api.js';
import { builtinBanner, copyName, projectCount, projectsOn, templateEntries } from '../src/templates/list.js';

function own(id: string, version: number, name: string, createdAt: string, system?: string): StoredTemplate {
  const body = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  Object.assign(body, { id, version, name, copiedFrom: 'Avventura' }, system ? { system } : {});
  return { id, version, body: defineTemplate(body), note: '', createdAt };
}

const stored = [
  own('t-kulthos0001', 1, 'Kulthos', '2026-10-20T09:00:00.000Z'),
  own('t-dnd0000001', 1, 'One-shot D&D 5e', '2026-10-21T09:00:00.000Z', 'D&D 5e'),
  own('t-kulthos0001', 2, 'Avventura Kulthos', '2026-10-22T09:00:00.000Z', 'Kulthos'),
];

describe('the template list', () => {
  it('lists the built-ins first, then the own templates at their latest version in the order they were made', () => {
    const usage = { 'avventura@1': 4, 't-kulthos0001@1': 1, 't-kulthos0001@2': 2, 'campagna@1': 1 };
    const entries = templateEntries(stored, usage, defaultSettings());
    expect(entries.map((e) => [e.id, e.name, e.version, e.builtin, e.projects, e.isDefault])).toEqual([
      ['avventura', 'Avventura', 1, true, 4, true],
      ['campagna', 'Campagna', 2, true, 1, true],
      ['t-kulthos0001', 'Avventura Kulthos', 2, false, 3, false],
      ['t-dnd0000001', 'One-shot D&D 5e', 1, false, 0, false],
    ]);
    expect(entries[2]).toMatchObject({ copiedFrom: 'Avventura', system: 'Kulthos', kind: 'adventure' });
  });

  it('marks the settings’ default, and the built-in when the settings name a template that is gone', () => {
    const settings = defaultSettings();
    settings.defaultTemplates.adventure = 't-kulthos0001';
    const marked = templateEntries(stored, {}, settings).filter((e) => e.isDefault).map((e) => e.id);
    expect(marked).toEqual(['campagna', 't-kulthos0001']);
    settings.defaultTemplates.adventure = 't-gone000001';
    expect(templateEntries(stored, {}, settings).filter((e) => e.isDefault).map((e) => e.id)).toEqual([
      'avventura',
      'campagna',
    ]);
  });

  it('sums the projects over every version of one id only', () => {
    expect(projectsOn({ 't-a@1': 1, 't-a@2': 2, 't-ab@1': 5 }, 't-a')).toBe(3);
    expect(projectCount(0)).toBe('no projects');
    expect(projectCount(1)).toBe('1 project');
    expect(projectCount(3)).toBe('3 projects');
  });

  it('lists «Campagna» once, at v2; a project on campagna@1 still reads v1', () => {
    const campaigns = templateEntries([], {}, defaultSettings()).filter((e) => e.kind === 'campaign');
    expect(campaigns.map((e) => [e.id, e.version, e.latest])).toEqual([['campagna', 2, templates.campagnaV2]]);
    expect(templateOf({ category: 'campaign', template: { id: 'campagna', version: 1 } })).toBe(templates.campagna);
    expect(templateOf({ category: 'campaign', template: { id: 'campagna', version: 2 } })).toBe(templates.campagnaV2);
  });

  it('says in a built-in’s banner that its older versions stay', () => {
    expect(builtinBanner(templates.campagnaV2)).toBe(
      "It can't be changed; duplicate it to make your own. v1 stays available for the projects that use it.",
    );
    expect(builtinBanner(templates.avventura)).toBe("It can't be changed; duplicate it to make your own.");
  });

  it('names a copy «Copia di …», numbered when the name is taken', () => {
    expect(copyName('Avventura', [])).toBe('Copia di Avventura');
    expect(copyName('Avventura', ['Copia di Avventura'])).toBe('Copia di Avventura (2)');
    expect(copyName('Avventura', ['Copia di Avventura', 'Copia di Avventura (2)'])).toBe('Copia di Avventura (3)');
  });
});
