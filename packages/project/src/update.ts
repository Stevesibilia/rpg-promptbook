import {
  columnMark,
  nightPartOf,
  parseAdventure,
  scenePartOf,
  templateChanges,
  templateColumn,
  type AdventureTemplate,
  type Model,
  type PlacedPart,
  type Range,
  type SectionDefinition,
  type Template,
  type TextEdit,
} from 'promptbook-format';
import { targetsOf } from './targets.js';

export interface UpdateOptions {
  // Write an empty heading for each section the new version adds.
  addSections: boolean;
  // Rewrite the headings and bold labels the new version renames.
  renameHeadings: boolean;
  // Write the new version's column as a mark on each part that takes one and
  // has no mark in the text (template-placement design decision A8). Marks
  // already written are never changed. Off when absent.
  writeColumns?: boolean;
}

// A ## heading of the document and the template section it names.
interface Present {
  name: string;
  // The heading line's start, and the end of the section's content.
  from: number;
  to: number;
}

// The template section a heading names, as the parser matches it: the
// heading equals the name or starts with it and a colon or a space; the
// longest name wins.
function sectionNamed(sections: readonly SectionDefinition[], heading: string): SectionDefinition | undefined {
  let best: SectionDefinition | undefined;
  for (const section of sections) {
    const { name } = section;
    const matches = heading === name || heading.startsWith(`${name}:`) || heading.startsWith(`${name} `);
    if (matches && (!best || name.length > best.name.length)) best = section;
  }
  return best;
}

function presentSections(text: string, template: Template): Present[] {
  const out: Present[] = [];
  for (const target of targetsOf(text, template)) {
    const isSection = target.kind === 'section' || (target.kind === 'heading' && target.level === 2);
    const section = isSection ? sectionNamed(template.sections, target.title) : undefined;
    if (section) out.push({ name: section.name, from: target.from, to: target.to });
  }
  return out;
}

const lineAt = (text: string, from: number) => {
  const end = text.indexOf('\n', from);
  return text.slice(from, end === -1 ? text.length : end);
};

// Where a ## heading's text ends on its line: before the trailing spaces and
// a closing run of #, where a mark goes.
function headingTextEnd(text: string, range: Range): number {
  const from = range.start.offset;
  const newline = text.indexOf('\n', from);
  let line = text.slice(from, Math.min(range.end.offset, newline === -1 ? text.length : newline)).trimEnd();
  const closing = /[ \t]+#+$/.exec(line);
  if (closing) line = line.slice(0, closing.index).trimEnd();
  return from + line.length;
}

// True when a mark written right after the bold label would read as one: the
// label has no colon and nothing follows it in its paragraph (A1).
function bareLabel(text: string, range: Range): boolean {
  const end = range.end.offset;
  if (/:(\*\*|__)$/.test(text.slice(range.start.offset, end)) || text[end] === ':') return false;
  const newline = text.indexOf('\n', end);
  if (newline === -1) return text.slice(end).trim() === '';
  if (text.slice(end, newline).trim() !== '') return false;
  const after = text.indexOf('\n', newline + 1);
  const next = text.slice(newline + 1, after === -1 ? text.length : after);
  // Only a bullet with text, or an ordered item numbered 1, ends a paragraph
  // in CommonMark: any other line continues it, and the mark would be text.
  return next.trim() === '' || /^ {0,3}([-*+]|1[.)])[ \t]+\S/.test(next);
}

// What the text will name a section or a field after the update's renames.
interface Names {
  section: (name: string) => string | undefined;
  field: (label: string, at: number) => string;
}

// The mark of the new version's column for each part of the text that takes
// one and has none, as an insert at the end of its heading or label. A part
// the new version will not read as the same part (its section or field was
// removed, or renamed while the text keeps the old name) gets none, and so
// does a revelations label a mark cannot follow.
function columnInserts(model: Model, text: string, from: AdventureTemplate, to: AdventureTemplate, names: Names): TextEdit[] {
  const out: TextEdit[] = [];
  const add = (at: number, part: PlacedPart) => out.push({ from: at, to: at, insert: ` ${columnMark(templateColumn(to, part))}` });
  for (const section of model.sections) {
    const part = nightPartOf(section.role);
    if (!part || section.mark || !section.name) continue;
    const now = names.section(section.name) ?? sectionNamed(to.sections, section.heading)?.name;
    if (nightPartOf(to.sections.find((s) => s.name === now)?.role) === part) add(headingTextEnd(text, section.headingRange), part);
  }
  const label = model.revelationsLabel;
  if (label && !label.mark && bareLabel(text, label.labelRange)) add(label.labelRange.end.offset, 'revelations');
  for (const field of model.scenes.flatMap((scene) => scene.fields)) {
    if (field.form !== 'block' || field.mark) continue;
    const part = scenePartOf(from.sceneFields.find((f) => f.label === field.label)?.role);
    const now = names.field(field.label, field.labelRange.start.offset);
    if (part && scenePartOf(to.sceneFields.find((f) => f.label === now)?.role) === part) add(field.labelRange.end.offset, part);
  }
  return out;
}

// Replaces the first `before` in the range with `after`, if it is there.
function rewrite(text: string, from: number, to: number, before: string, after: string): TextEdit | null {
  const at = text.slice(from, to).indexOf(before);
  return at === -1 ? null : { from: from + at, to: from + at + before.length, insert: after };
}

// The text edits that bring a document written for `from` in line with `to`
// (template-editor design decision 10): an empty `## Heading` for each added
// section, after the previous section of `to` the text holds, and the new
// name for each renamed section heading and scene field label the parser
// finds; with `writeColumns`, the new version's column mark on each part
// without one. Moved sections and fields are left where they are: only the
// rules change. The edits do not overlap and are in text order.
export function updateEdits(text: string, from: Template, to: Template, options: UpdateOptions): TextEdit[] {
  const changes = templateChanges(from, to);
  const edits: TextEdit[] = [];
  const present = presentSections(text, from);
  const adventures = from.kind === 'adventure' && to.kind === 'adventure' ? { from, to } : null;
  let parsed: Model | undefined;
  const model = (template: AdventureTemplate) => (parsed ??= parseAdventure(text, { template }).model);
  // Marks go on headings of the new version's sections that the update adds.
  const addedMark = (section: SectionDefinition) => {
    const part = options.writeColumns && adventures ? nightPartOf(section.role) : null;
    return part && adventures ? ` ${columnMark(templateColumn(adventures.to, part))}` : '';
  };

  // The section of `to` each section of `from` became.
  const renamedSection = new Map<string, SectionDefinition>();
  for (const change of changes) {
    if (change.what !== 'section' || change.detail !== 'renamed' || change.before === undefined) continue;
    const old = from.sections.find((s) => s.name === change.before || s.heading === change.before);
    const now = to.sections.find((s) => s.name === change.label || s.heading === change.label);
    if (old && now) renamedSection.set(old.name, now);
  }
  const becomes = (name: string) => renamedSection.get(name) ?? to.sections.find((s) => s.name === name);
  // The sections and field labels whose rename the edits write.
  const renamedHeadings = new Set<string>();
  const renamedLabels = new Map<number, string>();

  if (options.renameHeadings) {
    for (const section of present) {
      const old = from.sections.find((s) => s.name === section.name)!;
      const now = renamedSection.get(section.name);
      if (!now) continue;
      const line = lineAt(text, section.from);
      const full = old.heading ?? old.name;
      const edit = line.includes(full)
        ? rewrite(text, section.from, section.from + line.length, full, now.heading ?? now.name)
        : rewrite(text, section.from, section.from + line.length, old.name, now.name);
      if (edit) {
        edits.push(edit);
        renamedHeadings.add(section.name);
      }
    }
    if (adventures) {
      const renamedField = new Map<string, string>();
      for (const change of changes) {
        if (change.what === 'field' && change.detail === 'renamed' && change.before !== undefined) {
          renamedField.set(change.before, change.label);
        }
      }
      if (renamedField.size) {
        for (const field of model(adventures.from).scenes.flatMap((scene) => scene.fields)) {
          const now = renamedField.get(field.label);
          if (now === undefined) continue;
          const edit = rewrite(text, field.labelRange.start.offset, field.labelRange.end.offset, field.label, now);
          if (edit) {
            edits.push(edit);
            renamedLabels.set(field.labelRange.start.offset, now);
          }
        }
      }
    }
  }

  if (options.addSections) {
    // Where each section of `to` the text holds ends.
    const ends = new Map<string, number>();
    for (const section of present) {
      const now = becomes(section.name);
      if (now && !ends.has(now.name)) ends.set(now.name, section.to);
    }
    const first = present[0]?.from;
    const added = new Set(changes.filter((c) => c.what === 'section' && c.kind === 'added').map((c) => c.label));
    // Added sections after the same section of the text share one insert.
    const inserts = new Map<number, { before: boolean; headings: string[] }>();
    to.sections.forEach((section, index) => {
      if (!added.has(section.name)) return;
      let at: number | undefined;
      for (let i = index - 1; i >= 0 && at === undefined; i--) at = ends.get(to.sections[i]!.name);
      const before = at === undefined && first !== undefined;
      const offset = at ?? first ?? text.length;
      const insert = inserts.get(offset) ?? { before, headings: [] };
      insert.headings.push(`## ${section.heading ?? section.name}${addedMark(section)}`);
      inserts.set(offset, insert);
    });
    for (const [offset, { before, headings }] of inserts) {
      const block = headings.join('\n\n');
      let insert: string;
      if (before) insert = `${block}\n\n`;
      else if (offset === text.length) insert = `${!text ? '' : text.endsWith('\n') ? '\n' : '\n\n'}${block}\n`;
      else insert = `\n\n${block}`;
      edits.push({ from: offset, to: offset, insert });
    }
  }

  if (options.writeColumns && adventures) {
    const names: Names = {
      section: (name) => (renamedHeadings.has(name) ? renamedSection.get(name)?.name : undefined),
      field: (label, at) => renamedLabels.get(at) ?? label,
    };
    for (const mark of columnInserts(model(adventures.from), text, adventures.from, adventures.to, names)) {
      // A renamed heading gets its mark after the new name, in the same edit;
      // a section added right after an empty heading comes after its mark.
      const rename = edits.find((e) => e.to === mark.from && e.from < e.to);
      const added = edits.find((e) => e.from === mark.from && e.to === mark.from);
      if (rename) rename.insert += mark.insert;
      else if (added) added.insert = mark.insert + added.insert;
      else edits.push(mark);
    }
  }

  return edits.sort((a, b) => a.from - b.from || a.to - b.to);
}
