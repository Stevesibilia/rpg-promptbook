import { defineTemplate, templates, type AdventureTemplateInput } from 'promptbook-format';
import { updateEdits } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { applyEdits, checksAfter, checksText, updatePlan } from '../src/templates/update.js';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';

function kulthos(version: number, edit?: (d: AdventureTemplateInput) => void) {
  const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  Object.assign(definition, { id: 't-kulthos0001', version, name: 'Avventura Kulthos' });
  edit?.(definition);
  return defineTemplate(definition);
}

const v2 = kulthos(2);
const v3 = kulthos(3, (d) => {
  const truths = d.sections.findIndex((s) => s.role === 'truths');
  d.sections.splice(truths + 1, 0, { name: 'Atmosfera', requirement: 'optional', uid: 'u-atmosfera' });
  d.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
  d.sceneFields.find((f) => f.label === 'Prove e regole')!.requirement = 'required';
});

describe('the update dialog', () => {
  it('lists the headings it adds, after which section, and the ones it renames', () => {
    expect(updatePlan(v2, v3)).toEqual({
      added: [{ heading: 'Atmosfera', after: 'Verità del mondo' }],
      renamed: [{ before: 'Inizio forte', after: 'Apertura', what: 'section' }],
    });
  });

  it('says what the checks report after the update: a scene without a field now required', () => {
    // S2 loses its «Prove e regole».
    const text = sabaoth.replace('**Prove e regole:** leggere il quaderno bruciato [da manuale].\n', '');
    const edits = updateEdits(text, v2, v3, { addSections: true, renameHeadings: true });
    const after = checksAfter(text, v2, v3, edits)!;
    expect(after).toEqual({ errors: 1, warnings: 0, fresh: ['Scene S2 has no "Prove e regole" field'] });
    expect(checksText(after)).toBe('1 new error');
    const updated = applyEdits(text, edits);
    expect(updated).toContain('## Apertura');
    expect(updated).toContain('## Atmosfera');
  });

  it('names no change when the text already meets the new version', () => {
    const edits = updateEdits(sabaoth, v2, v3, { addSections: true, renameHeadings: true });
    expect(checksText(checksAfter(sabaoth, v2, v3, edits)!)).toBe('no change in the checks');
    expect(checksText({ errors: -2, warnings: 1, fresh: [] })).toBe('2 errors fewer, 1 new warning');
  });

  it('has no checks for a campaign', () => {
    expect(checksAfter('## Premessa\n', templates.campagna, templates.campagna, [])).toBeNull();
  });
});
