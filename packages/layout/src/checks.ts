import type { Position } from './positions.js';

// Warnings about the layout, for the review only: they never join the
// editor's problems.
export interface LayoutCheck {
  message: string;
  // "S2 · page 7", "S5 · pages 10–12".
  where: string;
  // The page the check is about, 1-based.
  page: number;
  sceneId: string;
}

export interface PageSize {
  width: number;
  height: number;
}

interface SceneSpan {
  id: string;
  first: number;
  end: Position;
}

// The page a scene starts on and its scene-end position, in document order.
function sceneSpans(positions: Position[]): SceneSpan[] {
  const starts = new Map<string, number>();
  const spans: SceneSpan[] = [];
  for (const position of positions) {
    if (!position.id) continue;
    if (position.kind === 'scene' && !starts.has(position.id)) starts.set(position.id, position.page);
    if (position.kind === 'scene-end') {
      const first = starts.get(position.id);
      if (first !== undefined) spans.push({ id: position.id, first, end: position });
    }
  }
  return spans.sort((a, b) => a.first - b.first);
}

const pagesOf = (span: SceneSpan) => span.end.page - span.first + 1;
const range = (from: number, to: number) => (from === to ? `${from}` : `${from}–${to}`);

export function layoutChecks(positions: Position[], pages: PageSize[]): LayoutCheck[] {
  const spans = sceneSpans(positions);
  const checks: LayoutCheck[] = [];
  spans.forEach((span, index) => {
    const next = spans[index + 1];
    const height = pages[span.end.page - 1]?.height;
    if (next && height !== undefined && next.first > span.end.page && span.end.y < height / 2) {
      checks.push({
        message: `Half of page ${span.end.page} is empty: ${span.id} ends early`,
        where: `${span.id} · page ${span.end.page}`,
        page: span.end.page,
        sceneId: span.id,
      });
    }
    const length = pagesOf(span);
    if (length >= 3) {
      const others = spans.filter((other) => other !== span).map(pagesOf);
      const usual = others.length > 0 ? ` (the others take ${range(Math.min(...others), Math.max(...others))})` : '';
      checks.push({
        message: `${span.id} runs to ${length} pages${usual}`,
        where: `${span.id} · pages ${range(span.first, span.end.page)}`,
        page: span.first,
        sceneId: span.id,
      });
    }
  });
  return checks;
}
