import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  defineTemplate,
  templateChanges,
  templates,
  type AdventureTemplate,
  type AdventureTemplateInput,
  type CampaignTemplate,
  type CampaignTemplateInput,
  type Template,
} from 'promptbook-format';
import { skeletonDocument } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { changeText } from '../src/templates/changes.js';
import { draftReducer, pdfAction, type DraftAction } from '../src/templates/draft.js';
import { previewMarks, rowMarks } from '../src/templates/marks.js';
import { SectionsTab } from '../src/templates/TemplateRows.js';

// The «In the PDF» column (template-pdf-layout design decisions 6 and 7).

function own<T extends Template>(built: T): T {
  const body = JSON.parse(JSON.stringify(built)) as AdventureTemplateInput | CampaignTemplateInput;
  body.id = 't-own0001';
  body.version = 2;
  body.name = `${built.name} mia`;
  let n = 0;
  for (const s of body.sections) s.uid = `u${++n}`;
  return defineTemplate(body as never) as T;
}

const run = (t: AdventureTemplate, ...actions: DraftAction[]) => actions.reduce(draftReducer, t as never) as AdventureTemplate;
const at = (t: Template, name: string) => t.sections.findIndex((s) => s.name === name);
const toggle = (t: AdventureTemplate, name: string, change: Parameters<typeof pdfAction>[2]) =>
  run(t, pdfAction(at(t, name), t.sections[at(t, name)]!, change));

const saved = run(own(templates.avventura), { type: 'add', list: 'sections', name: 'Atmosfera', uid: 'new-1' });

// The «In the PDF» cells of the Sections tab, as text, one row a line.
function column(draft: Template, readOnly = false): string[] {
  const html = renderToStaticMarkup(
    createElement(SectionsTab, { draft, saved: draft, dispatch: () => {}, readOnly, newUid: () => 'x' }),
  );
  const head = /<div class="rh g-sec"[^>]*>(.*?)<\/div>/.exec(html)![1]!;
  const cells = [...html.matchAll(/<span class="pdf">(.*?)<\/span><(?:button class="del|span><\/span><\/div)/g)].map((m) =>
    m[1]!
      .replace(/<button[^>]*aria-pressed="(true|false)"[^>]*?( disabled="")?>([^<]*)<\/button>/g, (_, on, disabled, text) =>
        `[${text}${on === 'true' ? ' on' : ''}${disabled ? ' disabled' : ''}]`,
      )
      .replace(/<span class="tg fixed"[^>]*>([^<]*)<\/span>/g, '{$1}'),
  );
  return [head.includes('In the PDF') ? 'In the PDF' : '(no header)', ...cells];
}

describe('the PDF toggles', () => {
  it('store an option only while it differs from its default', () => {
    const off = toggle(saved, 'Atmosfera', { newPage: false });
    expect(off.sections[at(off, 'Atmosfera')]!.pdf).toEqual({ newPage: false });
    const back = toggle(off, 'Atmosfera', { newPage: true });
    expect(JSON.stringify(back.sections[at(back, 'Atmosfera')])).toBe(JSON.stringify(saved.sections[at(saved, 'Atmosfera')]));
  });

  it('count no change once turned back, one while left out', () => {
    const back = toggle(toggle(saved, 'Atmosfera', { newPage: false }), 'Atmosfera', { newPage: true });
    expect(templateChanges(saved, back)).toEqual([]);
    expect(rowMarks(saved, back, 'sections').filter(Boolean)).toEqual([]);
    const out = toggle(saved, 'Prima della sessione', { print: false });
    expect(templateChanges(saved, out).map((c) => changeText(c, out))).toEqual(['PDF options of «Prima della sessione»']);
    expect(rowMarks(saved, out, 'sections')[at(out, 'Prima della sessione')]).toBe('changed');
  });
});

describe('the «In the PDF» column', () => {
  it('shows a role section\'s place and toggle, the appendix\'s place only, an own section\'s three toggles', () => {
    const cells = column(saved);
    expect(cells[0]).toBe('In the PDF');
    expect(cells[at(saved, 'Inizio forte') + 1]).toBe('{Start page}[Printed on]');
    expect(cells[at(saved, 'Da non perdere stasera') + 1]).toBe('{Night page, side}[Printed on]');
    expect(cells[at(saved, 'Appendice') + 1]).toBe('{Not printed}');
    expect(cells[at(saved, 'Atmosfera') + 1]).toBe('[Printed on][New page on][Side column]');
  });

  it('shows only «Left out» for an own section left out', () => {
    const out = toggle(saved, 'Atmosfera', { print: false });
    expect(column(out)[at(out, 'Atmosfera') + 1]).toBe('[Left out]');
    expect(column(toggle(saved, 'Prima della sessione', { print: false }))[at(saved, 'Prima della sessione') + 1]).toBe(
      '{References}[Left out]',
    );
  });

  it('disables the toggles of a built-in', () => {
    const cells = column(templates.avventura, true);
    expect(cells[at(templates.avventura, 'Schede') + 1]).toBe('{References}[Printed on disabled]');
  });

  it('has no column for a campaign', () => {
    const html = renderToStaticMarkup(
      createElement(SectionsTab, { draft: templates.campagna as CampaignTemplate, saved: templates.campagna, dispatch: () => {}, readOnly: false, newUid: () => 'x' }),
    );
    expect(html).not.toContain('In the PDF');
    expect(html).not.toContain('class="pdf"');
    expect(html).toContain('Campaigns have no PDF yet');
  });
});

describe('the starting document', () => {
  it('marks the sections that do not print «not in the PDF»', () => {
    const draft = toggle(saved, 'Prima della sessione', { print: false });
    const text = skeletonDocument(
      'adventure',
      { title: 'Nuova avventura', system: '', campaignTitle: null, author: '', copyright: '', licence: '' },
      draft,
    );
    const lines = text.split('\n');
    expect(previewMarks(text, saved, draft).filter((m) => m.out).map((m) => lines[m.line])).toEqual([
      '## Prima della sessione',
      '## Appendice: immagini e musica',
    ]);
  });

  it('marks nothing «not in the PDF» in a campaign', () => {
    const campaign = own(templates.campagna);
    const text = skeletonDocument(
      'campaign',
      { title: 'Nuova campagna', system: '', campaignTitle: null, author: '', copyright: '', licence: '' },
      campaign,
    );
    expect(previewMarks(text, campaign, campaign).filter((m) => m.out)).toEqual([]);
  });
});
