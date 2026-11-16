import type { EditorState } from '@codemirror/state';
import {
  columnMark,
  columnOf,
  nightPartOf,
  scenePartOf,
  type AdventureTemplate,
  type Column,
  type ColumnMark,
  type Model,
  type PlacedPart,
  type Range,
  type TextEdit,
} from 'promptbook-format';
import { analysisField, writableResult } from './analysis/field.js';

// The part under the cursor that takes a column, for the palette's «Move to
// side column» and «Move to main column» (template-placement design decision
// A9). Under the cursor means: in a section with the role reminders, clock or
// truths; in a block scene field of one of the four roles, from its label to
// the end of its blocks; on the revelations label or in its list.

export interface ColumnTarget {
  part: PlacedPart;
  // Where the part prints now: its mark, else the template.
  column: Column;
  mark: ColumnMark | null;
  // Where a new mark goes, after a space: the end of the heading's text or
  // the label's closing `**`.
  at: number;
}

// Where a ## heading's text ends on its line: before the trailing spaces and
// a closing run of #.
function headingTextEnd(text: string, range: Range): number {
  const from = range.start.offset;
  const newline = text.indexOf('\n', from);
  let line = text.slice(from, Math.min(range.end.offset, newline === -1 ? text.length : newline)).trimEnd();
  const closing = /[ \t]+#+$/.exec(line);
  if (closing) line = line.slice(0, closing.index).trimEnd();
  return from + line.length;
}

const lineEnd = (text: string, from: number) => {
  const end = text.indexOf('\n', from);
  return end === -1 ? text.length : end;
};

// True when a mark written right after the bold label would read as one: no
// colon, and nothing else in its paragraph (design decision A1 and accepted
// departure 4).
function bareLabel(text: string, range: Range): boolean {
  const end = range.end.offset;
  if (/:(\*\*|__)$/.test(text.slice(range.start.offset, end)) || text[end] === ':') return false;
  const newline = lineEnd(text, end);
  if (text.slice(end, newline).trim() !== '') return false;
  if (newline === text.length) return true;
  const next = text.slice(newline + 1, lineEnd(text, newline + 1));
  return next.trim() === '' || INTERRUPTS.test(next);
}

// A list item that can end a paragraph in CommonMark: a bullet, or an
// ordered item numbered 1, with some text.
const INTERRUPTS = /^ {0,3}([-*+]|1[.)])[ \t]+\S/;
const ITEM = /^ {0,3}([-*+]|\d+[.)])([ \t]|$)/;

// The end of the list right under a label's line: its items and their
// continuation lines; the label's line end when no list follows.
function listEnd(text: string, from: number): number {
  let end = lineEnd(text, from);
  let pos = end;
  let items = false;
  let blank = false;
  while (pos < text.length) {
    const start = pos + 1;
    const stop = lineEnd(text, start);
    const line = text.slice(start, stop);
    pos = stop;
    if (!line.trim()) {
      blank = true;
      continue;
    }
    const item = ITEM.test(line);
    if (!item && !(items && (!blank || /^( {2,}|\t)/.test(line)))) break;
    items ||= item;
    blank = false;
    end = stop;
  }
  return end;
}

const lineStart = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1;

const inside = (pos: number, from: number, to: number) => pos >= from && pos <= to;

export function columnTarget(model: Model, template: AdventureTemplate, text: string, pos: number): ColumnTarget | null {
  const target = (part: PlacedPart, mark: ColumnMark | null, at: number): ColumnTarget => ({
    part,
    column: columnOf(template, part, mark),
    mark,
    at,
  });

  const label = model.revelationsLabel;
  if (label && (label.mark || bareLabel(text, label.labelRange))) {
    const start = label.labelRange.start.offset;
    if (inside(pos, lineStart(text, start), listEnd(text, start))) {
      return target('revelations', label.mark, label.labelRange.end.offset);
    }
  }

  for (const section of model.sections) {
    const part = nightPartOf(section.role);
    if (part && inside(pos, section.headingRange.start.offset, section.range.end.offset)) {
      return target(part, section.mark, headingTextEnd(text, section.headingRange));
    }
  }

  for (const scene of model.scenes) {
    if (!inside(pos, scene.headingRange.start.offset, scene.range.end.offset)) continue;
    for (const field of scene.fields) {
      if (field.form !== 'block') continue;
      const part = scenePartOf(template.sceneFields.find((f) => f.label === field.label)?.role);
      const from = field.labelRange.start.offset;
      if (part && inside(pos, lineStart(text, from), field.range.end.offset)) {
        return target(part, field.mark, field.labelRange.end.offset);
      }
    }
  }
  return null;
}

// The part under the cursor in the editor's state, from a result that is
// never stale; null in a campaign.
export function columnTargetOf(state: EditorState): ColumnTarget | null {
  const template = state.field(analysisField, false)?.template;
  const result = writableResult(state);
  if (!template || !result) return null;
  return columnTarget(result.model, template, state.doc.toString(), state.selection.main.head);
}

// The one edit that moves the part to `to`: the mark replaced, or written
// after the heading or the label.
export function columnEdit(target: ColumnTarget, to: Column): TextEdit {
  const insert = columnMark(to);
  if (target.mark) return { from: target.mark.range.start.offset, to: target.mark.range.end.offset, insert };
  return { from: target.at, to: target.at, insert: ` ${insert}` };
}
