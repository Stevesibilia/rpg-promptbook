import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  defineTemplate,
  templateChanges,
  templateColumn,
  templates,
  type AdventureTemplate,
  type AdventureTemplateInput,
  type Template,
} from 'promptbook-format';
import { skeletonDocument } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { changeText } from '../src/templates/changes.js';
import { draftReducer, pdfAction, type DraftAction } from '../src/templates/draft.js';
import { previewMarks, rowMarks } from '../src/templates/marks.js';
import { nightSketch, sceneSketch } from '../src/templates/PageSketch.js';
import { FieldsTab, SectionsTab } from '../src/templates/TemplateRows.js';

// The column switches, the revelations' row and the page sketches of the
// template editor (template-placement design decision A9).

function own(): AdventureTemplate {
  const body = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  body.id = 't-own0001';
  body.version = 2;
  body.name = 'Avventura mia';
  let n = 0;
  for (const items of [body.sections, body.sceneFields, body.callouts, body.meta]) {
    for (const item of items) item.uid = `u${++n}`;
  }
  return defineTemplate(body);
}

const saved = own();
const run = (t: Template, ...actions: DraftAction[]) => actions.reduce(draftReducer, t) as AdventureTemplate;
const at = (t: Template, role: string) => t.sections.findIndex((s) => s.role === role);
const fieldAt = (t: AdventureTemplate, role: string) => t.sceneFields.findIndex((f) => f.role === role);

const html = (draft: AdventureTemplate, tab: typeof SectionsTab | typeof FieldsTab = SectionsTab, readOnly = false) =>
  renderToStaticMarkup(
    createElement(tab as typeof FieldsTab, { draft, saved: draft, dispatch: () => {}, readOnly, newUid: () => 'x' }),
  );

// The switches of the HTML, «name: Main|Side» with the pressed one starred.
const switches = (markup: string) =>
  [...markup.matchAll(/<span class="col" role="group" aria-label="Column: ([^"]*)">(.*?)<\/span>/g)].map(
    ([, name, buttons]) =>
      `${name!.replace(/&#x27;/g, "'")}: ${[...buttons!.matchAll(/aria-pressed="(true|false)"( disabled="")?>(\w+)</g)]
        .map(([, on, disabled, text]) => `${text}${on === 'true' ? '*' : ''}${disabled ? '-' : ''}`)
        .join('|')}`,
  );

describe('the column switches', () => {
  it('set a section, a field and the revelations through withColumn, and set back leave no change', () => {
    const cases: [DraftAction, DraftAction, (t: AdventureTemplate) => unknown][] = [
      [{ type: 'column', part: 'clock', column: 'side' }, { type: 'column', part: 'clock', column: 'main' }, (t) => t.sections[at(t, 'clock')]!.pdf],
      [{ type: 'column', part: 'cast', column: 'main' }, { type: 'column', part: 'cast', column: 'side' }, (t) => t.sceneFields[fieldAt(t, 'cast')]!.column],
      [{ type: 'column', part: 'revelations', column: 'main' }, { type: 'column', part: 'revelations', column: 'side' }, (t) => t.overview.column],
    ];
    for (const [move, back, stored] of cases) {
      const moved = run(saved, move);
      expect(stored(moved)).toBeTruthy();
      expect(templateChanges(saved, moved)).toHaveLength(1);
      const again = run(moved, back);
      expect(stored(again)).toBeUndefined();
      expect(JSON.stringify(again)).toBe(JSON.stringify(saved));
      expect(templateChanges(saved, again)).toEqual([]);
      expect(rowMarks(saved, again, 'sections').filter(Boolean)).toEqual([]);
      expect(rowMarks(saved, again, 'sceneFields').filter(Boolean)).toEqual([]);
    }
  });

  it('mark the moved row as changed, and the revelations mark no row', () => {
    const clock = run(saved, { type: 'column', part: 'clock', column: 'side' });
    expect(rowMarks(saved, clock, 'sections')[at(clock, 'clock')]).toBe('changed');
    const cast = run(saved, { type: 'column', part: 'cast', column: 'main' });
    expect(rowMarks(saved, cast, 'sceneFields')[fieldAt(cast, 'cast')]).toBe('changed');
    const revelations = run(saved, { type: 'column', part: 'revelations', column: 'main' });
    expect(rowMarks(saved, revelations, 'sections').filter(Boolean)).toEqual([]);
  });

  it('keep the column when «Printed» is toggled, and «Printed» when the column is set', () => {
    const moved = run(saved, { type: 'column', part: 'clock', column: 'side' });
    const i = at(moved, 'clock');
    const out = run(moved, pdfAction(i, moved.sections[i]!, { print: false }, 'adventure'));
    expect(out.sections[i]!.pdf).toEqual({ print: false, column: 'side' });
    const back = run(out, pdfAction(i, out.sections[i]!, { print: true }, 'adventure'));
    expect(back.sections[i]!.pdf).toEqual({ column: 'side' });
    const again = run(out, { type: 'column', part: 'clock', column: 'main' });
    expect(again.sections[i]!.pdf).toEqual({ print: false });
  });

  it('leave a campaign alone', () => {
    const campaign = templates.campagnaV2;
    expect(draftReducer(campaign, { type: 'column', part: 'clock', column: 'side' })).toBe(campaign);
  });

  it('show on the three night sections and the revelations, between the place and «Printed»', () => {
    expect(switches(html(saved))).toEqual([
      'Rivelazioni: Main|Side*',
      'Da non perdere stasera: Main|Side*',
      'Orologio: Main*|Side',
      'Verità del mondo: Main*|Side',
    ]);
    const moved = run(saved, { type: 'column', part: 'clock', column: 'side' });
    expect(switches(html(moved))).toContain('Orologio: Main|Side*');
    const row = /data-testid="section-row">(?:(?!data-testid).)*?aria-label="Column: Orologio"(?:(?!data-testid).)*/.exec(html(saved))![0];
    expect(row.indexOf('Night page')).toBeLessThan(row.indexOf('Column: Orologio'));
    expect(row.indexOf('Column: Orologio')).toBeLessThan(row.indexOf('Printed'));
  });

  it('are disabled on a built-in, with today’s places chosen', () => {
    expect(switches(html(templates.avventura, SectionsTab, true))).toEqual([
      'Rivelazioni: Main-|Side*-',
      'Da non perdere stasera: Main-|Side*-',
      'Orologio: Main*-|Side-',
      'Verità del mondo: Main*-|Side-',
    ]);
    expect(switches(html(templates.avventura, FieldsTab, true))).toEqual([
      'Da non perdere qui: Main-|Side*-',
      'Cosa succede da sé: Main*-|Side-',
      "Chi c'è: Main-|Side*-",
      'Indizi qui: Main*-|Side-',
    ]);
  });
});

describe('the revelations row', () => {
  it('follows the overview, cannot be edited, and is no section of the draft', () => {
    const markup = html(saved);
    const rows = [...markup.matchAll(/data-testid="(section-row|revelations-row)"/g)].map((m) => m[1]);
    expect(rows.filter((r) => r === 'revelations-row')).toHaveLength(1);
    expect(rows.indexOf('revelations-row')).toBe(at(saved, 'overview') + 1);
    expect(markup).toContain('<input aria-label="Revelations label" disabled="" value="↳ Rivelazioni"/>');
    expect(markup).toContain('title="The list of revelations inside this section"');
    expect(markup).toContain('its list');
    const sub = /<div class="rr g-sec subrow".*?<\/div>/.exec(markup)![0];
    expect(sub).not.toContain('Move');
    expect(sub).not.toContain('Remove');
    expect(saved.sections.some((s) => s.name === 'Rivelazioni')).toBe(false);
  });

  it('is not there in a campaign', () => {
    const markup = renderToStaticMarkup(
      createElement(SectionsTab, { draft: templates.campagnaV2, saved: templates.campagnaV2, dispatch: () => {}, readOnly: true, newUid: () => 'x' }),
    );
    expect(markup).not.toContain('revelations-row');
    expect(markup).not.toContain('class="col"');
    expect(markup).not.toContain('Night page');
  });
});

describe('the Scene fields tab', () => {
  it('has an «In the PDF» column with the switch or the field’s fixed place', () => {
    const markup = html(saved, FieldsTab);
    expect(/<div class="rh g-fld"[^>]*>(.*?)<\/div>/.exec(markup)![1]).toContain('<span>In the PDF</span>');
    const cells = [...markup.matchAll(/data-testid="field-row">(.*?)<button class="del/g)].map((m) => {
      const fixed = /<span class="tg fixed" title="([^"]*)">([^<]*)<\/span>/.exec(m[1]!);
      return fixed ? `{${fixed[2]}}` : /class="col"/.test(m[1]!) ? 'switch' : '?';
    });
    expect(cells).toEqual(
      saved.sceneFields.map((f) =>
        ({ place: '{Scene header}', inPlay: '{Scene header}', tests: '{Framed, main column}', derail: '{End of main column}' })[
          f.role as string
        ] ?? (['mustHave', 'happens', 'cast', 'clues'].includes(f.role ?? '') ? 'switch' : '{Under both columns}'),
      ),
    );
    expect(cells.filter((c) => c === '{Under both columns}').length).toBeGreaterThan(0);
    expect(markup).toContain('title="This field&#x27;s place on the scene page is set by the layout"');
  });

  it('gives an own field without a role its place under both columns', () => {
    const added = run(saved, { type: 'add', list: 'sceneFields', name: 'Atmosfera', uid: 'new-1' });
    const markup = html(added, FieldsTab);
    expect(/aria-label="Label, row \d+" value="Atmosfera"\/>.*?<span class="tg fixed"[^>]*>([^<]*)</.exec(markup)![1]).toBe(
      'Under both columns',
    );
  });
});

describe('the page sketches', () => {
  const names = (parts: { name: string }[]) => parts.map((p) => p.name);

  it('draw the night page in print order, the reminders first on the side', () => {
    const sketch = nightSketch(saved);
    expect(sketch.top).toBe("A colpo d'occhio");
    expect(names(sketch.main)).toEqual(['Orologio', 'Verità del mondo']);
    expect(names(sketch.side)).toEqual(['Da non perdere stasera', 'Rivelazioni']);
    expect(sketch.sideAfter).toEqual(['[!riquadro|laterale] boxes']);
  });

  it('follow the switches and leave out a section left out', () => {
    let draft = run(saved, { type: 'column', part: 'clock', column: 'side' }, { type: 'column', part: 'revelations', column: 'main' });
    expect(names(nightSketch(draft).main)).toEqual(['Rivelazioni', 'Verità del mondo']);
    expect(names(nightSketch(draft).side)).toEqual(['Da non perdere stasera', 'Orologio']);
    const i = at(draft, 'truths');
    draft = run(draft, pdfAction(i, draft.sections[i]!, { print: false }, 'adventure'));
    expect(names(nightSketch(draft).main)).toEqual(['Rivelazioni']);
    const all = run(saved, { type: 'column', part: 'reminders', column: 'main' });
    const j = at(all, 'clock');
    const none = run(all, pdfAction(j, all.sections[j]!, { print: false }, 'adventure'), pdfAction(at(all, 'truths'), all.sections[at(all, 'truths')]!, { print: false }, 'adventure'), { type: 'column', part: 'revelations', column: 'side' });
    expect(names(nightSketch(none).main)).toEqual(['Da non perdere stasera']);
    const markup = renderToStaticMarkup(createElement(SectionsTab, { draft: run(saved, pdfAction(at(saved, 'clock'), saved.sections[at(saved, 'clock')]!, { print: false }, 'adventure'), pdfAction(at(saved, 'truths'), saved.sections[at(saved, 'truths')]!, { print: false }, 'adventure')), saved, dispatch: () => {}, readOnly: false, newUid: () => 'x' }));
    expect(markup).toContain('<span class="none">nothing</span>');
  });

  it('leave out the overview and its revelations when the overview is left out', () => {
    const i = at(saved, 'overview');
    const out = run(saved, pdfAction(i, saved.sections[i]!, { print: false }, 'adventure'));
    expect(nightSketch(out).top).toBeNull();
    expect(names(nightSketch(out).side)).toEqual(['Da non perdere stasera']);
  });

  it('draw the scene page in the layout’s fixed order', () => {
    const sketch = sceneSketch(saved);
    expect(sketch.top).toBe('Title · Luogo e momento · In gioco');
    expect(sketch.mainBefore).toEqual(['Da leggere']);
    expect(names(sketch.main)).toEqual(['Cosa succede da sé', 'Indizi qui']);
    expect(sketch.mainAfter).toEqual(['Boxes, Prove e regole, reactions, Se deragliano']);
    expect(names(sketch.side)).toEqual(['Da non perdere qui', "Chi c'è"]);
    expect(sketch.sideAfter).toEqual(['Threat sheets', '[!riquadro|laterale] boxes']);
    expect(sketch.bottom).toBe('Climax fields and other labels');
    // The table order does not change the print order.
    const moved = run(saved, { type: 'move', list: 'sceneFields', index: fieldAt(saved, 'clues'), by: -1 }, { type: 'column', part: 'mustHave', column: 'main' });
    expect(names(sceneSketch(moved).main)).toEqual(['Da non perdere qui', 'Cosa succede da sé', 'Indizi qui']);
    expect(templateColumn(moved, 'mustHave')).toBe('main');
  });

  it('show under both tables of an adventure', () => {
    expect(html(saved)).toContain('Night page · where each part prints');
    expect(html(saved, FieldsTab)).toContain('Scene page · where each part prints');
  });
});

describe('the starting document', () => {
  const input = { title: 'Nuova avventura', system: '', campaignTitle: null, author: '', copyright: '', licence: '' };

  it('marks a marked heading optional, out of the PDF and changed', () => {
    const i = at(saved, 'truths');
    const draft = run(
      saved,
      { type: 'patch', list: 'sections', index: i, patch: { requirement: 'optional' } },
      pdfAction(i, saved.sections[i]!, { print: false }, 'adventure'),
      { type: 'column', part: 'clock', column: 'side' },
    );
    const text = skeletonDocument('adventure', input, draft);
    const lines = text.split('\n');
    const line = (heading: string) => lines.indexOf(heading);
    expect(line('## Verità del mondo {principale}')).toBeGreaterThan(0);
    expect(line('## Orologio {laterale}')).toBeGreaterThan(0);
    const marks = previewMarks(text, saved, draft);
    expect(marks.find((m) => m.line === line('## Verità del mondo {principale}'))).toEqual({
      line: line('## Verità del mondo {principale}'),
      mark: 'changed',
      optional: true,
      out: true,
      newPage: false,
    });
    expect(marks.find((m) => m.line === line('## Orologio {laterale}'))?.mark).toBe('changed');
  });

  it('marks a moved field’s label', () => {
    const draft = run(saved, { type: 'column', part: 'mustHave', column: 'main' });
    const text = skeletonDocument('adventure', input, draft);
    const n = text.split('\n').indexOf('**Da non perdere qui** {principale}');
    expect(n).toBeGreaterThan(0);
    expect(previewMarks(text, saved, draft).find((m) => m.line === n)?.mark).toBe('changed');
  });
});

describe('the change list', () => {
  it('says where a section, a field and the revelations print, and keeps the box wording', () => {
    const draft = run(
      saved,
      { type: 'column', part: 'clock', column: 'side' },
      { type: 'column', part: 'cast', column: 'main' },
      { type: 'column', part: 'revelations', column: 'main' },
      {
        type: 'patch',
        list: 'callouts',
        index: saved.callouts.findIndex((c) => c.type === 'riquadro' && !c.meta),
        patch: { column: 'side' },
      },
    );
    expect(templateChanges(saved, draft).map((c) => changeText(c, draft))).toEqual([
      'Section «Orologio» prints in the side column',
      'Revelations list «Rivelazioni» prints in the main column',
      "Scene field «Chi c'è» prints in the main column",
      'Box «Riquadro» now in the side column',
    ]);
  });
});
