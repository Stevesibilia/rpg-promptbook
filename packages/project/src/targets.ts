import { parseAdventure, templates } from 'promptbook-format';
import { sameName } from './doc.js';
import type { Category } from './model.js';

// The parts of a prep document Claude reads and replaces one at a time
// (connector design decision 3).
export interface Target {
  kind: 'section' | 'scene' | 'sheet' | 'heading';
  // What a caller names it by: the template's section name or an unknown
  // section's heading text, a scene's id ("S3"), a sheet's name, a campaign
  // heading's text.
  target: string;
  // The heading's text: "Appendice: immagini e musica", "Il cordone di Donato".
  title: string;
  // The number of # in its heading.
  level: number;
  // From the start of the heading line to the end of its content, without the
  // blank lines after it, so a replacement keeps the separator.
  from: number;
  to: number;
}

export type FoundTarget =
  | { ok: true; target: Target }
  | { ok: false; error: 'unknown_target'; targets: Target[] }
  | { ok: false; error: 'ambiguous_target'; targets: Target[] };

const lineStart = (text: string, offset: number) => text.lastIndexOf('\n', offset - 1) + 1;

// Moves an end back over the blank lines before it.
function trimEnd(text: string, from: number, to: number): number {
  return from + text.slice(from, to).replace(/(?:\r?\n[ \t]*)+$/, '').length;
}

const SCENE_ID = new RegExp(`^${templates.avventura.ids.scene}\\d+$`);

const levelAt = (text: string, offset: number) => /^ {0,3}(#+)/.exec(text.slice(offset, offset + 12))?.[1]?.length ?? 0;

// Every target of the document, in text order. An adventure or a one-shot is
// read with the template: its sections, scenes and sheets. A campaign is not
// parsed: its ## and ### headings.
export function targetsOf(text: string, category: Category): Target[] {
  return category === 'campaign' ? headingTargets(text) : adventureTargets(text);
}

function adventureTargets(text: string): Target[] {
  const { model } = parseAdventure(text, { template: templates.avventura });
  const targets: Target[] = [];
  const span = (headingStart: number, end: number) => {
    const from = lineStart(text, headingStart);
    return { from, to: trimEnd(text, from, end), level: levelAt(text, from) };
  };

  for (const section of model.sections) {
    targets.push({
      kind: 'section',
      target: section.id,
      title: section.heading,
      ...span(section.headingRange.start.offset, section.range.end.offset),
    });
  }

  // A scene runs from its heading line to the next scene's heading, or to the
  // end of its section for the last one, as the editor's scene move reads it.
  const scenes = model.sections.find((s) => s.role === 'scenes');
  model.scenes.forEach((scene, i) => {
    const next = model.scenes[i + 1];
    const end = next
      ? lineStart(text, next.headingRange.start.offset)
      : Math.max(scene.range.end.offset, scenes?.range.end.offset ?? 0);
    targets.push({
      kind: 'scene',
      target: scene.id ?? scene.heading,
      title: scene.title,
      ...span(scene.headingRange.start.offset, end),
    });
  });

  for (const sheet of model.sheets) {
    targets.push({
      kind: 'sheet',
      target: sheet.name,
      title: sheet.title,
      ...span(sheet.headingRange.start.offset, sheet.range.end.offset),
    });
  }
  return targets.sort((a, b) => a.from - b.from);
}

// ATX headings outside fenced code and the front matter. A heading of level
// 2 or 3 is a target; it runs to the next heading of the same or a higher
// level.
function headingTargets(text: string): Target[] {
  const headings: { level: number; title: string; from: number }[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let fence: string | null = null;
  let frontMatter = lines[0]?.replace(/\r$/, '') === '---';
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const at = offset;
    offset += raw.length + 1;
    if (frontMatter) {
      if (i > 0 && (line === '---' || line === '...')) frontMatter = false;
      return;
    }
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== null) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
      return;
    }
    if (marker) {
      fence = marker;
      return;
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (heading) headings.push({ level: heading[1]!.length, title: (heading[2] ?? '').trim(), from: at });
  });

  const targets: Target[] = [];
  headings.forEach((heading, i) => {
    if (heading.level < 2 || heading.level > 3) return;
    const next = headings.slice(i + 1).find((h) => h.level <= heading.level);
    targets.push({
      kind: 'heading',
      target: heading.title,
      title: heading.title,
      level: heading.level,
      from: heading.from,
      to: trimEnd(text, heading.from, next?.from ?? text.length),
    });
  });
  return targets;
}

// The one target a caller names. A scene id matches exactly, case
// insensitive; any other name matches as sameName compares. No match answers
// every target; two answer both.
export function findTarget(text: string, category: Category, name: string): FoundTarget {
  const targets = targetsOf(text, category);
  const wanted = name.trim();
  const matches = targets.filter((t) =>
    t.kind === 'scene' && SCENE_ID.test(t.target)
      ? t.target.toLowerCase() === wanted.toLowerCase()
      : sameName(t.target, wanted),
  );
  if (matches.length === 1) return { ok: true, target: matches[0]! };
  if (matches.length === 0) return { ok: false, error: 'unknown_target', targets };
  return { ok: false, error: 'ambiguous_target', targets: matches };
}
