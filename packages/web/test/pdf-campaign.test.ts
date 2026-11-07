import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defineTemplate, templates, type CampaignTemplate, type CampaignTemplateInput } from 'promptbook-format';
import { defaultLayoutOptions, type CampaignLayoutInput, type LayoutInput } from 'promptbook-layout';
import { describe, expect, it } from 'vitest';
import fixture from '../../format/fixtures/campagna-di-prova.md?raw';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { currentSection, outlineOf } from '../src/editor/outline.js';
import { unprintedSection } from '../src/editor/pdf/PdfPane.js';
import { prepare } from '../src/editor/pdf/prepare.js';
import { PdfReview } from '../src/editor/pdf/PdfReview.js';
import { campaign } from './analysed.js';

// The campaign's PDF in the web (campaign-pdf design decision 10): the
// worker's input, the pane's caption, the review's options, the outline's ids.

function leftOut(name: string): CampaignTemplate {
  const body = JSON.parse(JSON.stringify(templates.campagnaV2)) as CampaignTemplateInput;
  body.id = 't-own0000001';
  body.version = 3;
  const section = body.sections.find((s) => s.name === name)!;
  section.pdf = { print: false };
  return defineTemplate(body);
}

describe('the worker’s input', () => {
  it('builds a campaign template’s document in the campaign layout, without the appendix', () => {
    const options = { ...defaultLayoutOptions, template: 'campagna@1' as const };
    const prepared = prepare({ text: fixture, options, project: { title: 'Progetto' }, template: templates.campagnaV2 });
    const input = prepared.input as CampaignLayoutInput;
    expect(input.options.template).toBe('campagna@1');
    expect(input.sections.map((s) => s.title)).not.toContain(expect.stringMatching(/^Appendice/));
    expect(input.sections.map((s) => s.title)).toContain('Appunti del master');
    // Every printed section starts where its heading is in the text, so the
    // pane follows the cursor and a double-click jumps back.
    for (const section of input.sections) expect(fixture.slice(section.from).startsWith(`## ${section.title}`)).toBe(true);
    expect(prepared.checks([], [])).toEqual([]);
  });

  it('builds an adventure as before, in the adventure layout', () => {
    const prepared = prepare({
      text: sabaoth,
      options: defaultLayoutOptions,
      project: { title: 'Sabaoth' },
      template: templates.avventura,
    });
    const input = prepared.input as LayoutInput;
    expect(input.options.template).toBe('avventura@1');
    expect(input.scenes.length).toBeGreaterThan(0);
  });
});

describe('the pane on a section that does not print', () => {
  it('names the appendix and a section left out, and nothing for printed sections or adventures', () => {
    expect(unprintedSection(templates.campagnaV2, 'Appendice: stile visivo e sonoro')).toBe('the appendix');
    expect(unprintedSection(templates.campagnaV2, 'Fronti')).toBeNull();
    expect(unprintedSection(templates.campagnaV2, 'Appunti del master')).toBeNull();
    expect(unprintedSection(templates.campagnaV2, null)).toBeNull();
    expect(unprintedSection(leftOut('Aggiornamenti'), 'Aggiornamenti')).toBe('«Aggiornamenti»');
    expect(unprintedSection(leftOut('Aggiornamenti'), 'Aggiornamenti di marzo')).toBe('«Aggiornamenti di marzo»');
    expect(unprintedSection(templates.avventura, 'Appendice')).toBeNull();
  });

  it('reads the ## section holding the cursor, none before the first', () => {
    const doc = '---\ntitolo: X\n---\n\nPrima.\n\n## Fronti\n\n### F1. La Compagnia\n\nTesto.\n\n## Appendice\n\nPrompt.\n';
    expect(currentSection(campaign(doc, doc.indexOf('Prima')))).toBeNull();
    expect(currentSection(campaign(doc, doc.indexOf('Testo')))).toBe('Fronti');
    expect(currentSection(campaign(doc, doc.indexOf('## Appendice')))).toBe('Appendice');
    expect(currentSection(campaign(doc, doc.indexOf('Prompt')))).toBe('Appendice');
  });
});

describe('the campaign outline', () => {
  it('shows the id of a ### X. Name heading as its badge, and plain headings as they are', () => {
    const doc = '## Fronti\n\n### F1. La Compagnia\n\n### Note sparse\n\n### AB12. Il Porto\n\n## Archi\n';
    expect(outlineOf(campaign(doc)).map((i) => [i.depth, i.id, i.name, i.place])).toEqual([
      [0, null, 'Fronti', 'Fronti'],
      [1, 'F1', 'La Compagnia', 'F1 · La Compagnia'],
      [1, null, 'Note sparse', 'Note sparse'],
      [1, 'AB12', 'Il Porto', 'AB12 · Il Porto'],
      [0, null, 'Archi', 'Archi'],
    ]);
    // Only ### headings take an id.
    expect(outlineOf(campaign('## F1. Fronti\n')).map((i) => i.id)).toEqual([null]);
  });

  it('reads a heading as the parser does, without its Markdown marks', () => {
    const doc = '## *Aggiornamenti* ##\n\n### F1. **La Compagnia** di `Valmora`\n\nTesto.\n';
    expect(outlineOf(campaign(doc)).map((i) => [i.id, i.name])).toEqual([
      [null, 'Aggiornamenti'],
      ['F1', 'La Compagnia di Valmora'],
    ]);
    expect(currentSection(campaign(doc, doc.indexOf('Testo')))).toBe('Aggiornamenti');
    expect(unprintedSection(leftOut('Aggiornamenti'), currentSection(campaign(doc, doc.indexOf('Testo'))))).toBe(
      '«Aggiornamenti»',
    );
  });
});

describe('the review of a campaign', () => {
  const render = (
    template: Parameters<typeof PdfReview>[0]['template'],
    layout: 'avventura@1' | 'campagna@1',
    templateMissing = false,
  ) =>
    renderToStaticMarkup(
      createElement(PdfReview, {
        snapshot: null,
        initialPage: 1,
        template,
        templateMissing,
        options: { ...defaultLayoutOptions, template: layout },
        setOptions: () => {},
        onClose: () => {},
        onJump: () => {},
        onSave: async () => {},
        onPrint: async () => {},
      }),
    );

  it('has no pregenerated sheets and names the campaign template', () => {
    const html = render(templates.campagnaV2, 'campagna@1');
    expect(html).not.toContain('Pregenerated sheets');
    expect(html).toContain('<option value="campagna@1" selected="">Campagna v2</option>');
    expect(html).toContain('Ink saver');
  });

  it('says when the project’s own template is not on this device', () => {
    expect(render(templates.campagnaV2, 'campagna@1', true)).toContain(
      '<option value="campagna@1" selected="">Campagna v2 · template not found</option>',
    );
  });

  it('keeps the adventure’s options', () => {
    const html = render(templates.avventura, 'avventura@1');
    expect(html).toContain('Pregenerated sheets');
    expect(html).toContain('<option value="avventura@1" selected="">Avventura v1</option>');
  });
});
