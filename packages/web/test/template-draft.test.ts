import { defineTemplate, templateChanges, templates, type AdventureTemplate, type AdventureTemplateInput } from 'promptbook-format';
import { skeletonDocument } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { changeText, issueText } from '../src/templates/changes.js';
import { checkDraft, draftReducer, isLocked, keyRenamable, warnsOnDashes, type DraftAction } from '../src/templates/draft.js';
import { previewMarks, rowMarks } from '../src/templates/marks.js';

// An own template as the server makes it: a copy of Avventura, every item
// with a uid.
function kulthos(): AdventureTemplate {
  const body = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  body.id = 't-kulthos0001';
  body.version = 2;
  body.name = 'Avventura Kulthos';
  body.copiedFrom = 'Avventura';
  let n = 0;
  for (const items of [body.sections, body.sceneFields, body.callouts, body.meta]) {
    for (const item of items) item.uid = `u${++n}`;
  }
  return defineTemplate(body);
}

const run = (t: AdventureTemplate, ...actions: DraftAction[]) => actions.reduce(draftReducer, t as never) as AdventureTemplate;
const index = (t: AdventureTemplate, role: string) => t.sections.findIndex((s) => s.role === role);

// The mockup's three demo edits: «Atmosfera» added after «Verità del mondo»,
// «Inizio forte» renamed «Apertura», «Prove e regole» made required.
function demo(saved: AdventureTemplate) {
  let draft = run(
    saved,
    { type: 'patch', list: 'sections', index: index(saved, 'strongStart'), patch: { name: 'Apertura' } },
    { type: 'add', list: 'sections', name: 'Atmosfera', uid: 'new-1' },
    {
      type: 'patch',
      list: 'sceneFields',
      index: saved.sceneFields.findIndex((f) => f.label === 'Prove e regole'),
      patch: { requirement: 'required' },
    },
  );
  // Added before the scenes; moved up to sit after «Verità del mondo».
  while (draft.sections.findIndex((s) => s.name === 'Atmosfera') > index(draft, 'truths') + 1) {
    draft = run(draft, { type: 'move', list: 'sections', index: draft.sections.findIndex((s) => s.name === 'Atmosfera'), by: -1 });
  }
  return draft;
}

describe('the template draft', () => {
  it('applies the mockup’s demo edits, and the changes read as the mockup lists them', () => {
    const saved = kulthos();
    const draft = demo(saved);
    const check = checkDraft(draft);
    expect(check.ok).toBe(true);
    const texts = templateChanges(saved, draft).map((c) => [c.kind, changeText(c, draft)]);
    expect(texts).toEqual([
      ['added', 'Section «Atmosfera», optional'],
      ['changed', 'Section «Inizio forte» renamed «Apertura»'],
      ['changed', 'Scene field «Prove e regole» now required'],
    ]);
  });

  it('refuses to remove a locked row, and removes an own one', () => {
    const saved = kulthos();
    expect(run(saved, { type: 'remove', list: 'sections', index: 0 })).toBe(saved);
    const added = run(saved, { type: 'add', list: 'sections', name: 'Atmosfera', uid: 'n1' });
    const at = added.sections.findIndex((s) => s.name === 'Atmosfera');
    expect(at).toBe(index(saved, 'scenes'));
    expect(run(added, { type: 'remove', list: 'sections', index: at }).sections).toEqual(saved.sections);
    const leggi = saved.callouts.findIndex((c) => c.type === 'leggi');
    expect(isLocked('callouts', saved.callouts[leggi]!)).toBe(true);
    expect(run(saved, { type: 'remove', list: 'callouts', index: leggi })).toBe(saved);
    // At «any» per place, it can go.
    const any = run(saved, { type: 'patch', list: 'callouts', index: leggi, patch: { perPlace: { min: 0, max: null } } });
    expect(run(any, { type: 'remove', list: 'callouts', index: leggi }).callouts).toHaveLength(3);
  });

  it('locks the keys the app reads, by role or by name', () => {
    const saved = kulthos();
    const key = (k: string) => saved.meta.find((m) => m.key === k)!;
    expect(keyRenamable(key('titolo'))).toBe(false);
    expect(keyRenamable(key('durata'))).toBe(false);
    expect(keyRenamable(key('fronti'))).toBe(true);
    expect(isLocked('meta', key('linguetta'))).toBe(false);
  });

  it('gives new boxes a type, a label and «any» per place, and toggles the dashes warning', () => {
    const saved = kulthos();
    const draft = run(saved, { type: 'add', list: 'callouts', name: 'mappa del tesoro', uid: 'n1' }, { type: 'dashes', on: false });
    expect(draft.callouts.at(-1)).toMatchObject({ type: 'mappa-del-tesoro', label: 'Mappa del tesoro', role: 'box', uid: 'n1' });
    expect(warnsOnDashes(draft)).toBe(false);
    expect(warnsOnDashes(run(draft, { type: 'dashes', on: true }))).toBe(true);
    expect(checkDraft(draft).ok).toBe(true);
  });

  it('sets and clears the game system', () => {
    const saved = kulthos();
    expect(run(saved, { type: 'system', value: 'Kulthos' }).system).toBe('Kulthos');
    expect('system' in run(saved, { type: 'system', value: 'Kulthos' }, { type: 'system', value: '' })).toBe(false);
  });

  it('says what is wrong with an invalid draft, by list and row', () => {
    const saved = kulthos();
    const draft = run(saved, { type: 'patch', list: 'sections', index: 3, patch: { name: '' } });
    const check = checkDraft(draft);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.issues.map(issueText)).toContain('Sections, row 4: expected a non-empty label');
    const twice = run(saved, { type: 'add', list: 'sections', name: 'Orologio', uid: 'n1' });
    const again = checkDraft(twice);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.issues.map(issueText).join()).toContain('duplicate section "Orologio"');
  });
});

describe('the rows’ and the preview’s marks', () => {
  it('marks the renamed row amber and the added one green, the rest not', () => {
    const saved = kulthos();
    const draft = demo(saved);
    const marks = rowMarks(saved, draft, 'sections');
    expect(draft.sections.filter((_, i) => marks[i] === 'added').map((s) => s.name)).toEqual(['Atmosfera']);
    expect(draft.sections.filter((_, i) => marks[i] === 'changed').map((s) => s.name)).toEqual(['Apertura']);
    const fields = rowMarks(saved, draft, 'sceneFields');
    expect(draft.sceneFields.filter((_, i) => fields[i]).map((f) => f.label)).toEqual(['Prove e regole']);
  });

  it('marks the starting document’s lines those rows write, and the optional headings', () => {
    const saved = kulthos();
    const draft = demo(saved);
    const text = skeletonDocument('adventure', {
      title: 'Nuova avventura',
      system: '',
      campaignTitle: null,
      author: '',
      copyright: '',
      licence: '',
    }, draft);
    const lines = text.split('\n');
    const marks = previewMarks(text, saved, draft).map((m) => [lines[m.line], m.mark, m.optional]);
    expect(marks).toContainEqual(['## Apertura', 'changed', false]);
    expect(marks).toContainEqual(['## Atmosfera', 'added', true]);
    expect(marks).toContainEqual(['**Prove e regole:** ', 'changed', false]);
    expect(marks).toContainEqual(['## Antefatto', null, true]);
    expect(marks.filter(([, mark]) => mark)).toHaveLength(3);
  });
});
