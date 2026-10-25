import {
  parseAdventure,
  templateChanges,
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

// Replaces the first `before` in the range with `after`, if it is there.
function rewrite(text: string, from: number, to: number, before: string, after: string): TextEdit | null {
  const at = text.slice(from, to).indexOf(before);
  return at === -1 ? null : { from: from + at, to: from + at + before.length, insert: after };
}

// The text edits that bring a document written for `from` in line with `to`
// (template-editor design decision 10): an empty `## Heading` for each added
// section, after the previous section of `to` the text holds, and the new
// name for each renamed section heading and scene field label the parser
// finds. Moved sections and fields are left where they are: only the rules
// change. The edits do not overlap and are in text order.
export function updateEdits(text: string, from: Template, to: Template, options: UpdateOptions): TextEdit[] {
  const changes = templateChanges(from, to);
  const edits: TextEdit[] = [];
  const present = presentSections(text, from);

  // The section of `to` each section of `from` became.
  const renamedSection = new Map<string, SectionDefinition>();
  for (const change of changes) {
    if (change.what !== 'section' || change.detail !== 'renamed' || change.before === undefined) continue;
    const old = from.sections.find((s) => s.name === change.before || s.heading === change.before);
    const now = to.sections.find((s) => s.name === change.label || s.heading === change.label);
    if (old && now) renamedSection.set(old.name, now);
  }
  const becomes = (name: string) => renamedSection.get(name) ?? to.sections.find((s) => s.name === name);

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
      if (edit) edits.push(edit);
    }
    if (from.kind === 'adventure' && to.kind === 'adventure') {
      const renamedField = new Map<string, string>();
      for (const change of changes) {
        if (change.what === 'field' && change.detail === 'renamed' && change.before !== undefined) {
          renamedField.set(change.before, change.label);
        }
      }
      if (renamedField.size) {
        const { model } = parseAdventure(text, { template: from });
        for (const field of model.scenes.flatMap((scene) => scene.fields)) {
          const now = renamedField.get(field.label);
          if (now === undefined) continue;
          const edit = rewrite(text, field.labelRange.start.offset, field.labelRange.end.offset, field.label, now);
          if (edit) edits.push(edit);
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
      insert.headings.push(`## ${section.heading ?? section.name}`);
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

  return edits.sort((a, b) => a.from - b.from || a.to - b.to);
}
