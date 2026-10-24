import { defineTemplate, templates, type AdventureTemplateInput } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { adventureTemplateOf, readMeta, templateOf } from '../src/index.js';
import { project } from './helpers.js';

const own = defineTemplate({
  ...(JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput),
  id: 'mia',
  version: 2,
  name: 'Mia',
});

describe('templateOf', () => {
  it('answers the built-in a project records', () => {
    expect(templateOf(readMeta(project()))).toBe(templates.avventura);
    expect(templateOf(readMeta(project({ category: 'campaign' })))).toBe(templates.campagna);
  });

  it('answers an extra template by id and version', () => {
    const meta = readMeta(project({ template: { id: 'mia', version: 2 } }));
    expect(templateOf(meta, [own])).toBe(own);
    expect(adventureTemplateOf(meta, [own])).toBe(own);
  });

  it('answers the category\'s built-in for a template the device does not hold', () => {
    const meta = readMeta(project({ template: { id: 'mia', version: 3 } }));
    expect(templateOf(meta, [own])).toBe(templates.avventura);
    const campaign = readMeta(project({ category: 'campaign', template: { id: 'mia', version: 3 } }));
    expect(templateOf(campaign, [own])).toBe(templates.campagna);
  });

  it('answers the category\'s built-in for a template of the wrong kind', () => {
    expect(templateOf({ category: 'campaign', template: { id: 'avventura', version: 1 } })).toBe(templates.campagna);
    expect(templateOf({ category: 'one-shot', template: { id: 'campagna', version: 1 } })).toBe(templates.avventura);
    expect(templateOf({ category: 'adventure', template: { id: 'mia', version: 2 } }, [own])).toBe(own);
  });

  it('answers the built-in adventure template to a reader that parses a campaign', () => {
    expect(adventureTemplateOf(readMeta(project({ category: 'campaign' })))).toBe(templates.avventura);
  });
});
