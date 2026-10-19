// Where the template printed each part, scene and block: what lets the
// preview follow the cursor and a double-click on a page jump to the text.

export interface Position {
  kind: 'part' | 'scene' | 'block' | 'scene-end';
  // "S3" for scenes, the part name for parts.
  id?: string;
  // What a thumbnail shows: "Cover", "S3", "Schede"…
  label?: string;
  // The source offset of what was printed there.
  from: number;
  // 1-based.
  page: number;
  // Points from the top of the page.
  y: number;
}

// By page, then from the top of the page; positions at the same place keep
// the order the template printed them in.
export function sortPositions(positions: Position[]): Position[] {
  return positions
    .map((position, index) => ({ position, index }))
    .sort((a, b) => a.position.page - b.position.page || a.position.y - b.position.y || a.index - b.index)
    .map(({ position }) => position);
}

// The page that prints the text at `offset`: the page of the position whose
// source starts nearest at or before it, the first in page order on a tie.
// A block the template prints on a later page with an earlier source (a
// side box, a moved part) does not win over the block the offset is in.
// Page 1 when nothing starts at or before it.
export function pageOf(positions: Position[], offset: number): number {
  let found: Position | null = null;
  for (const position of positions) {
    if (position.from <= offset && (!found || position.from > found.from)) found = position;
  }
  return found?.page ?? 1;
}

// What was printed at `y` points from the top of `page`: the last position on
// that page at or above it, else the last one before the page.
export function blockAt(positions: Position[], page: number, y: number): Position | null {
  let found: Position | null = null;
  for (const position of positions) {
    if (position.page > page || (position.page === page && position.y > y)) break;
    found = position;
  }
  return found;
}
