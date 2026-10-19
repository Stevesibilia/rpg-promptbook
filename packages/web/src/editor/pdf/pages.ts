import type { LayoutCheck, Position } from 'promptbook-layout';
import type { SvgPage } from './protocol.js';

// The pure parts of the PDF pane and review, tested without a browser.

// The renderer's SVG stacks the pages as `<g class="typst-page"
// transform="translate(0, y)">`. Each gets an id, so a page can be drawn
// anywhere with a `<use>` (design decision 10). Left out: the text selection
// layer (one foreignObject per line of text), since nothing selects text in
// the preview, and the inline click handlers of links inside the document,
// which the content security policy refuses.
export function prepareSvg(svg: string): { svg: string; pages: SvgPage[] } {
  const pages: SvgPage[] = [];
  const marked = svg.replace(/<g class="typst-page"([^>]*)>/g, (_, attributes: string) => {
    const number = (pattern: RegExp) => Number(pattern.exec(attributes)?.[1] ?? 0);
    pages.push({
      top: number(/transform="translate\([^,]*,\s*([-\d.]+)\)"/),
      width: number(/data-page-width="([\d.]+)"/),
      height: number(/data-page-height="([\d.]+)"/),
    });
    return `<g class="typst-page" id="${pageId(pages.length)}"${attributes}>`;
  });
  const svgOnly = marked
    .replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/g, '')
    .replace(/\son[a-z]+="[^"]*"/g, '');
  return { svg: svgOnly, pages };
}

export const pageId = (page: number): string => `pb-page-${page}`;

// The pages a spread shows: the cover alone, then 2–3, 4–5… with the even
// page on the left.
export function spreadOf(page: number, count: number): number[] {
  if (count < 1) return [];
  const at = Math.min(Math.max(page, 1), count);
  if (at === 1) return [1];
  const left = at % 2 === 0 ? at : at - 1;
  return left + 1 <= count ? [left, left + 1] : [left];
}

export type StageMode = 'single' | 'spread' | 'fit';

// The pages the stage shows for the current page.
export function shownPages(mode: StageMode, page: number, count: number): number[] {
  if (count < 1) return [];
  if (mode === 'spread') return spreadOf(page, count);
  return [Math.min(Math.max(page, 1), count)];
}

// The page the stage moves to, a view forward or back.
export function stepPage(mode: StageMode, page: number, count: number, step: 1 | -1): number {
  const shown = shownPages(mode, page, count);
  if (!shown.length) return 1;
  const next = step > 0 ? shown[shown.length - 1]! + 1 : shown[0]! - 1;
  return Math.min(Math.max(next, 1), count);
}

// «Pages 6–7 of 14», «Page 1 of 14».
export function pagesLabel(shown: number[], count: number): string {
  if (!shown.length) return '';
  const first = shown[0]!;
  const last = shown[shown.length - 1]!;
  return first === last ? `Page ${first} of ${count}` : `Pages ${first}–${last} of ${count}`;
}

// What each page's thumbnail says after its number ("Cover", "S1",
// "Schede"): the first part or scene that starts on the page, else the last
// one started before it. The cover page also starts the night.
export function pageLabels(positions: readonly Position[], count: number): string[] {
  const labels: string[] = [];
  let current = '';
  let index = 0;
  for (let page = 1; page <= count; page += 1) {
    let first = '';
    for (; index < positions.length && positions[index]!.page <= page; index += 1) {
      const position = positions[index]!;
      if ((position.kind === 'part' || position.kind === 'scene') && position.label) {
        current = position.label;
        if (position.page === page) first ||= position.label;
      }
    }
    labels.push(first || current);
  }
  return labels;
}

// The pages a layout check is about, for the thumbnails' marks.
export const checkedPages = (checks: readonly LayoutCheck[]): Set<number> => new Set(checks.map((c) => c.page));

// The file Save PDF downloads: the title as a slug, «l-ancora-di-sabaoth.pdf».
export function pdfFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'promptbook'}.pdf`;
}
