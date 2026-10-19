import type { Position } from 'promptbook-layout';
import { describe, expect, it } from 'vitest';
import {
  checkedPages,
  pageLabels,
  pagesLabel,
  pdfFileName,
  prepareSvg,
  shownPages,
  spreadOf,
  stepPage,
} from '../src/editor/pdf/pages.js';

const at = (kind: Position['kind'], page: number, label?: string): Position => ({
  kind,
  from: 0,
  page,
  y: 0,
  ...(label ? { label } : {}),
});

describe('the spreads', () => {
  it('shows the cover alone, then pairs with the even page on the left', () => {
    expect(spreadOf(1, 14)).toEqual([1]);
    expect(spreadOf(2, 14)).toEqual([2, 3]);
    expect(spreadOf(3, 14)).toEqual([2, 3]);
    expect(spreadOf(7, 14)).toEqual([6, 7]);
    expect(spreadOf(14, 14)).toEqual([14]);
    expect(spreadOf(13, 13)).toEqual([12, 13]);
  });

  it('keeps the page inside the document', () => {
    expect(spreadOf(0, 5)).toEqual([1]);
    expect(spreadOf(9, 5)).toEqual([4, 5]);
    expect(spreadOf(1, 0)).toEqual([]);
  });

  it('shows one page in the other modes and steps a view at a time', () => {
    expect(shownPages('single', 6, 14)).toEqual([6]);
    expect(shownPages('fit', 20, 14)).toEqual([14]);
    expect(stepPage('spread', 1, 14, 1)).toBe(2);
    expect(stepPage('spread', 2, 14, 1)).toBe(4);
    expect(stepPage('spread', 3, 14, -1)).toBe(1);
    expect(stepPage('single', 6, 14, -1)).toBe(5);
    expect(stepPage('single', 14, 14, 1)).toBe(14);
  });

  it('says which pages are shown', () => {
    expect(pagesLabel([6, 7], 14)).toBe('Pages 6–7 of 14');
    expect(pagesLabel([1], 14)).toBe('Page 1 of 14');
    expect(pagesLabel([], 0)).toBe('');
  });
});

describe('the thumbnails', () => {
  it('label each page with the first part or scene started on it, else the last one before', () => {
    const positions = [
      at('part', 1, 'Cover'),
      at('block', 1),
      at('part', 1, 'Notte'),
      at('part', 2, 'Inizio'),
      at('scene', 4, 'S1'),
      at('block', 5),
      at('scene-end', 6),
      at('scene', 6, 'S2'),
      at('part', 6, 'Schede'),
    ];
    expect(pageLabels(positions, 7)).toEqual(['Cover', 'Inizio', 'Inizio', 'S1', 'S1', 'S2', 'Schede']);
  });

  it('mark the pages a layout check is about', () => {
    const check = { message: '', where: '', sceneId: 'S2' };
    expect([...checkedPages([{ ...check, page: 7 }, { ...check, page: 10 }])]).toEqual([7, 10]);
  });
});

describe('the rendered document', () => {
  const svg =
    '<svg class="typst-doc" viewBox="0 0 596 1684"><defs class="glyph"><path id="g1"/></defs>' +
    '<g class="typst-page" transform="translate(0, 0)" data-tid="a" data-page-width="596" data-page-height="842">' +
    '<a xlink:href="#" onclick="handleTypstLocation(this, 10, 39.6, 293.0); return false"><rect/></a>' +
    '<use href="#g1"/><g transform="scale(16,-16)"><foreignObject x="0" y="-48.75" width="2" height="6">' +
    '<h5:div class="tsel">Ciao &amp; addio</h5:div></foreignObject></g></g>' +
    '<g class="typst-page" transform="translate(0, 842)" data-tid="b" data-page-width="612" data-page-height="792">' +
    '<use href="#g1"/></g></svg>';

  it('gives every page an id and its place in the stack', () => {
    const prepared = prepareSvg(svg);
    expect(prepared.pages).toEqual([
      { top: 0, width: 596, height: 842 },
      { top: 842, width: 612, height: 792 },
    ]);
    expect(prepared.svg).toContain('<g class="typst-page" id="pb-page-1" transform="translate(0, 0)"');
    expect(prepared.svg).toContain('<g class="typst-page" id="pb-page-2" transform="translate(0, 842)"');
  });

  it('leaves out the text selection layer and the click handlers, and nothing else', () => {
    const prepared = prepareSvg(svg);
    expect(prepared.svg).not.toContain('foreignObject');
    expect(prepared.svg).toContain('<a xlink:href="#"><rect/></a>');
    expect(prepared.svg).not.toContain('Ciao');
    expect(prepared.svg.match(/<use href="#g1"\/>/g)).toHaveLength(2);
  });
});

describe('the saved file', () => {
  it('is named after the title', () => {
    expect(pdfFileName("L'Ancora di Sabaoth")).toBe('l-ancora-di-sabaoth.pdf');
    expect(pdfFileName('Città — notte')).toBe('citta-notte.pdf');
    expect(pdfFileName('!!!')).toBe('promptbook.pdf');
  });
});
