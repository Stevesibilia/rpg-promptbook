import type { AdventureTemplate, CalloutDefinition, Model, Scene, TextEdit } from 'promptbook-format';

// Every insert of design decision 8, shared by This scene, the `/` menu and
// the palette so each writes the same text. Labels, callout types, the
// references marker, the reactions table's first header and the scene id
// prefix come from the template.

// Where the read-aloud box goes among the scene fields: after the field with
// the mustHave role, whatever the template calls it (template-registry design
// decision 1).
export const readAloudAfter = (template: AdventureTemplate): string | undefined =>
  template.sceneFields.find((f) => f.role === 'mustHave')?.label;

// The template has no data for the reactions table's second header yet
// (design decision 8); the starting document writes the same one.
import { REACTIONS_THEN } from 'promptbook-project';
export { REACTIONS_THEN };

export type Insert =
  // A missing scene field, in template order.
  | { kind: 'field'; label: string }
  // The read-aloud row of This scene: the box in its template slot.
  | { kind: 'readAloud' }
  // A callout as its own block after the cursor's block.
  | { kind: 'callout'; callout: CalloutDefinition }
  // The references marker, at the cursor on its own line.
  | { kind: 'sheetRef' }
  // The reactions table after the cursor's block.
  | { kind: 'reactions' }
  // A new scene heading with the next free number, at the cursor's line.
  | { kind: 'scene' };

export interface InsertContext {
  // The text the model was read from.
  text: string;
  model: Model;
  template: AdventureTemplate;
  // The cursor.
  pos: number;
  // The `/` menu's line: the block replaces this range instead of going where
  // the insert would put it.
  at?: { from: number; to: number };
}

export interface Placed {
  edit: TextEdit;
  // The cursor once the edit is applied: where the user types next.
  cursor: number;
  // Set for the references marker: open the sheet names' completion.
  complete?: 'sheets';
}

// The scene holding `pos`, from its heading to the end of its content.
export function sceneAt(model: Model, pos: number): number {
  return model.scenes.findIndex((s) => s.headingRange.start.offset <= pos && pos <= s.range.end.offset);
}

// What an insert writes, and where in it the cursor goes.
export function insertText(what: Insert, template: AdventureTemplate, model?: Model): { text: string; cursor: number } {
  const end = (text: string) => ({ text, cursor: text.length });
  switch (what.kind) {
    case 'field': {
      const field = template.sceneFields.find((f) => f.label === what.label);
      return end(field?.form === 'block' ? `**${what.label}**\n\n- ` : `**${what.label}:** `);
    }
    case 'readAloud': {
      const callout = readAloudOf(template);
      return callout ? insertText({ kind: 'callout', callout }, template) : end('');
    }
    case 'callout': {
      const { type, meta, title } = what.callout;
      const header = `> [!${meta ? `${type}|${meta}` : type}]`;
      // A callout with a title takes the cursor on its header line.
      return title === 'none' ? end(`${header}\n> `) : { text: `${header} \n> `, cursor: header.length + 1 };
    }
    case 'sheetRef':
      return end(`${template.references.marker} `);
    case 'reactions': {
      const head = `| ${template.tables.reactions.firstHeader}… | ${REACTIONS_THEN} |\n| --- | --- |\n| `;
      return { text: `${head} |  |`, cursor: head.length };
    }
    case 'scene':
      return end(`### ${template.ids.scene}${model ? nextSceneNumber(model, template) : 1}. `);
  }
}

// The template's read-aloud box; a template may have none (template-editor
// design decision 12).
export function readAloudOf(template: AdventureTemplate): CalloutDefinition | undefined {
  return template.callouts.find((c) => c.role === 'readAloud');
}

// One more than the highest scene number in use.
export function nextSceneNumber(model: Model, template: AdventureTemplate): number {
  const prefix = template.ids.scene;
  let highest = 0;
  for (const { id } of model.scenes) {
    if (!id?.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return highest + 1;
}

// Where an insert goes and what it writes; null when it needs a scene and
// the cursor is in none.
export function placeInsert(what: Insert, ctx: InsertContext): Placed | null {
  const { text, model, template, pos, at } = ctx;
  // Nothing to write for a box the template does not have.
  if (what.kind === 'readAloud' && !readAloudOf(template)) return null;
  const { text: block, cursor } = insertText(what, template, model);
  const lines = linesOf(text);

  if (at) {
    const gap = around(lines, at.from, at.to);
    return finish(text, gap, block, cursor, what);
  }

  switch (what.kind) {
    case 'field':
    case 'readAloud': {
      const index = sceneAt(model, pos);
      if (index < 0) return null;
      const anchor = slotAnchor(model.scenes[index]!, template, what.kind === 'field' ? what.label : null);
      return finish(text, after(lines, anchor), block, cursor, what);
    }
    case 'callout':
    case 'reactions':
      return finish(text, afterBlockAt(lines, pos), block, cursor, what);
    case 'sheetRef': {
      const line = lines.at(pos);
      // On the cursor's line when it is empty, else on a new line after it.
      if (line.blank)
        return {
          edit: { from: line.from, to: line.to, insert: block },
          cursor: line.from + cursor,
          complete: 'sheets',
        };
      return {
        edit: { from: line.to, to: line.to, insert: `\n${block}` },
        cursor: line.to + 1 + cursor,
        complete: 'sheets',
      };
    }
    case 'scene': {
      const line = lines.at(pos);
      return finish(text, around(lines, line.from, line.to), block, cursor, what);
    }
  }
}

// The template order of a scene, with the read-aloud box as a slot of its
// own; `null` stands for that slot.
function slots(template: AdventureTemplate): (string | null)[] {
  const labels = template.sceneFields.map((f) => f.label);
  const after = readAloudAfter(template);
  const i = after === undefined ? -1 : labels.indexOf(after);
  return i < 0 ? [...labels, null] : [...labels.slice(0, i + 1), null, ...labels.slice(i + 1)];
}

// Where a missing field (or the read-aloud box, for `null`) goes: the end of
// the last present one that comes before it in template order, or the end
// of the heading line.
function slotAnchor(scene: Scene, template: AdventureTemplate, label: string | null): number {
  const order = slots(template);
  const target = order.indexOf(label);
  const endOf = (slot: string | null): number | null => {
    if (slot === null) {
      const last = scene.readAlouds.at(-1);
      const box = last ? scene.boxes.find((b) => b.id === last) : undefined;
      return box ? box.range.end.offset : null;
    }
    const field = scene.fields.find((f) => f.known && f.label === slot);
    return field ? field.range.end.offset : null;
  };
  for (let i = target - 1; i >= 0; i--) {
    const end = endOf(order[i]!);
    if (end !== null) return end;
  }
  return scene.headingRange.end.offset;
}

interface Line {
  from: number;
  to: number;
  blank: boolean;
}

function linesOf(text: string) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const line = (n: number): Line => {
    const from = starts[n]!;
    const to = n + 1 < starts.length ? starts[n + 1]! - 1 : text.length;
    return { from, to, blank: text.slice(from, to).trim() === '' };
  };
  const indexAt = (pos: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return { count: starts.length, line, indexAt, at: (pos: number) => line(indexAt(pos)), length: text.length };
}

type Lines = ReturnType<typeof linesOf>;

// The whitespace between two pieces of content: from the end of the last
// non-blank line before it (0 at the top) to the start of the first
// non-blank line after it (the end at the bottom).
interface Gap {
  before: number;
  after: number;
}

// The gap around the lines from `from` to `to`, which it replaces.
function around(lines: Lines, from: number, to: number): Gap {
  let first = lines.indexAt(from) - 1;
  while (first >= 0 && lines.line(first).blank) first--;
  let last = lines.indexAt(to) + 1;
  while (last < lines.count && lines.line(last).blank) last++;
  return {
    before: first >= 0 ? lines.line(first).to : 0,
    after: last < lines.count ? lines.line(last).from : lines.length,
  };
}

// The gap after the line holding `pos`.
function after(lines: Lines, pos: number): Gap {
  const n = lines.indexAt(pos);
  let next = n + 1;
  while (next < lines.count && lines.line(next).blank) next++;
  return { before: lines.line(n).to, after: next < lines.count ? lines.line(next).from : lines.length };
}

// The gap after the cursor's block, the run of non-blank lines holding it;
// on a blank line, the gap that line is in.
function afterBlockAt(lines: Lines, pos: number): Gap {
  let n = lines.indexAt(pos);
  if (lines.line(n).blank) return around(lines, lines.line(n).from, lines.line(n).to);
  while (n + 1 < lines.count && !lines.line(n + 1).blank) n++;
  return after(lines, lines.line(n).to);
}

// Fills a gap with the block and exactly one blank line on each side (none
// at the top, the text's own final newline at the bottom), as one edit
// spanning only what changes.
function finish(text: string, { before, after }: Gap, block: string, cursor: number, what: Insert): Placed {
  const old = text.slice(before, after);
  const head = before > 0 ? '\n\n' : '';
  const tail = after < text.length ? '\n\n' : old.includes('\n') ? '\n' : '';
  const insert = head + block + tail;
  let start = 0;
  while (start < old.length && start < insert.length && old[start] === insert[start]) start++;
  let end = 0;
  while (
    end < old.length - start &&
    end < insert.length - start &&
    old[old.length - 1 - end] === insert[insert.length - 1 - end]
  )
    end++;
  return {
    edit: { from: before + start, to: after - end, insert: insert.slice(start, insert.length - end) },
    cursor: before + head.length + cursor,
    ...(what.kind === 'sheetRef' ? { complete: 'sheets' as const } : {}),
  };
}
