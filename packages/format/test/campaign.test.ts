import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCampaign, templates, type CampaignBlock } from '../src/index.js';

const text = readFileSync(new URL('../fixtures/campagna-di-prova.md', import.meta.url), 'utf8');
const parsed = parseCampaign(text, { template: templates.campagnaV2 });
const section = (title: string) => parsed.sections.find((s) => s.title === title)!;
const slice = (block: { range: { start: { offset: number }; end: { offset: number } } }) =>
  text.slice(block.range.start.offset, block.range.end.offset);
const kinds = (blocks: CampaignBlock[]) => blocks.map((b) => b.kind);

describe('parseCampaign', () => {
  it('reads every ## section in document order, known or not', () => {
    expect(parsed.sections.map((s) => [s.title, s.known, s.role, s.pdf.print, s.pdf.newPage])).toEqual([
      ['Premessa', true, null, true, false],
      ['Verità del mondo', true, null, true, false],
      ['Fronti', true, null, true, true],
      ['Fazioni', true, null, true, false],
      ['PNG ricorrenti', true, null, true, true],
      ['Archi', true, null, true, true],
      ['Fili aperti', true, null, true, true],
      ['Appunti del master', false, null, true, false],
      ['Appendice: stile visivo e sonoro', true, 'appendix', false, false],
    ]);
    expect(parsed.sections.every((s) => !s.pdf.sideColumn)).toBe(true);
  });

  it('keeps every heading as written, a prefix match giving only the options', () => {
    const doc = '## Archi narrativi\n\nUno.\n\n## Premessa: la città\n\nDue.\n\n## Appendice: altro\n\nTre.\n';
    const read = parseCampaign(doc, { template: templates.campagnaV2 });
    expect(read.sections.map((s) => [s.title, s.known, s.role, s.pdf.print, s.pdf.newPage])).toEqual([
      ['Archi narrativi', true, null, true, true],
      ['Premessa: la città', true, null, true, false],
      ['Appendice: altro', true, 'appendix', false, false],
    ]);
    expect(Object.keys(read.sections[0]!)).not.toContain('heading');
  });

  it('reads the front matter against the campaign template', () => {
    expect(parsed.meta.values).toMatchObject({
      titolo: 'Le lanterne di Valmora',
      sistema: 'Kulthos',
      formato: 'campagna',
      autore: 'Autore di prova',
      licenza: 'CC-BY-4.0',
    });
    expect(parsed.meta.licence).toEqual({ text: 'CC-BY-4.0', spdx: true });
  });

  it('keeps the text before the first ## as the lead', () => {
    expect(kinds(parsed.lead)).toEqual(['paragraph']);
    expect(slice(parsed.lead[0]!)).toMatch(/^Appunti sparsi/);
  });

  it('reads ### X. Name as an ID subheading and any other heading as a plain one', () => {
    const fronti = section('Fronti').blocks.filter((b) => b.kind === 'subheading');
    expect(fronti.map((b) => [b.id, b.name, b.depth])).toEqual([
      ['F1', 'La Gilda dei Lumi', 3],
      ['F2', 'Le acque basse', 3],
    ]);
    const png = section('PNG ricorrenti').blocks.filter((b) => b.kind === 'subheading');
    expect(png.map((b) => [b.id, b.name])).toEqual([
      [null, 'Maestra Orsola'],
      [null, 'Nane Spina'],
    ]);
    const deeper = parseCampaign('## Archi\n\n#### A3. Più in basso\n\n### a1. minuscolo\n\n### F1.\n', {
      template: templates.campagnaV2,
    });
    expect(deeper.sections[0]!.blocks.map((b) => b.kind === 'subheading' && [b.id, b.name, b.depth])).toEqual([
      [null, 'A3. Più in basso', 4],
      [null, 'a1. minuscolo', 3],
      [null, 'F1.', 3],
    ]);
  });

  it('keeps a quote a quote and a callout a callout', () => {
    expect(kinds(section('Fronti').blocks)).toContain('quote');
    const callout = section('PNG ricorrenti').blocks.find((b) => b.kind === 'callout');
    expect(callout).toMatchObject({ type: 'nota', title: 'Al tavolo', content: "Nane mente sempre sulla profondità dell'acqua, mai sulla strada." });
  });

  it('reads tables and task lists as blocks', () => {
    const table = section('Fazioni').blocks.find((b) => b.kind === 'table');
    expect(table?.kind === 'table' && table.header.length).toBe(6);
    const clock = section('Fronti').blocks.find((b) => b.kind === 'list');
    expect(clock?.kind === 'list' && clock.items.map((i) => i.checked)).toEqual([true, false, false, false]);
  });

  it('gives ranges that slice back to the heading and the block text', () => {
    for (const s of parsed.sections) {
      expect(text.slice(s.from)).toMatch(new RegExp(`^## ${s.title}\\n`));
      expect(text.slice(s.from, s.to).trimEnd()).toBe(text.slice(s.from, s.to));
      for (const block of s.blocks) {
        expect(slice(block)).toBe(block.text);
        expect(block.range.start.offset).toBeGreaterThan(s.from);
        expect(block.range.end.offset).toBeLessThanOrEqual(s.to);
      }
    }
    const f1 = section('Fronti').blocks[0]!;
    expect(slice(f1)).toBe('### F1. La Gilda dei Lumi');
    const last = parsed.sections.at(-1)!;
    expect(text.slice(last.to).trim()).toBe('');
  });

  it('returns no problems, even for a malformed callout or a bad front matter', () => {
    const odd = parseCampaign('---\ntitolo: [\n---\n\n## Premessa\n\n> [!non valido!]\n> testo\n', { template: templates.campagnaV2 });
    expect(Object.keys(odd)).toEqual(['meta', 'lead', 'sections']);
    expect(odd.sections[0]!.blocks.map((b) => b.kind)).toEqual(['quote']);
  });

  it('reads a document with no ## at all as lead only', () => {
    const plain = parseCampaign('Solo appunti.\n\n### F1. Un fronte\n', { template: templates.campagnaV2 });
    expect(plain.sections).toEqual([]);
    expect(kinds(plain.lead)).toEqual(['paragraph', 'subheading']);
    expect(parseCampaign('', { template: templates.campagnaV2 })).toMatchObject({ lead: [], sections: [] });
  });

  it('reads an empty section with its heading as its whole range', () => {
    const empty = parseCampaign('## Premessa\n## Fronti\n\nTesto.\n', { template: templates.campagnaV2 });
    expect(empty.sections[0]).toMatchObject({ title: 'Premessa', from: 0, to: '## Premessa'.length, blocks: [] });
  });
});
