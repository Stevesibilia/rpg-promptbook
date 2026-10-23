import { parseAdventure, type AdventureTemplate, type Template } from 'promptbook-format';
import { sameName } from './doc.js';

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

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const lineStart = (text: string, offset: number) => text.lastIndexOf('\n', offset - 1) + 1;

const isBlank = (char: string | undefined) => char === ' ' || char === '\t';

// Moves an end back over the blank lines before it: every line break, with
// the spaces and tabs after it, at the end. A loop, not a regex: a regex
// anchored at the end is quadratic on a long run of blank lines.
function trimEnd(text: string, from: number, to: number): number {
  let end = to;
  for (;;) {
    let i = end;
    while (i > from && isBlank(text[i - 1])) i--;
    if (i <= from || text[i - 1] !== '\n') return end;
    i--;
    if (i > from && text[i - 1] === '\r') i--;
    end = i;
  }
}

const levelAt = (text: string, offset: number) => /^ {0,3}(#+)/.exec(text.slice(offset, offset + 12))?.[1]?.length ?? 0;

// Every target of the document, in text order. An adventure or a one-shot is
// read with its template: its sections, scenes and sheets. A campaign is not
// parsed: its ## and ### headings.
export function targetsOf(text: string, template: Template): Target[] {
  return template.kind === 'campaign' ? headingTargets(text) : adventureTargets(text, template);
}

function adventureTargets(text: string, template: AdventureTemplate): Target[] {
  const { model } = parseAdventure(text, { template });
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

const LIST_OR_QUOTE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|^ {0,3}>/;

// The front matter: a first line of --- closed by a later line of --- or
// ...; the number of lines it takes, none when it is not closed.
function frontMatterLines(lines: readonly string[]): number {
  if (lines[0] !== '---') return 0;
  const close = lines.findIndex((line, i) => i > 0 && (line === '---' || line === '...'));
  return close === -1 ? 0 : close + 1;
}

// ATX and setext headings outside fenced code and the front matter. An ATX
// heading of level 2 or 3 is a target; it runs to the next heading of the
// same or a higher level, setext ones included, which are not targets.
function headingTargets(text: string): Target[] {
  const headings: { level: number; title: string; from: number; target: boolean }[] = [];
  const raws = text.split('\n');
  const lines = raws.map((raw) => raw.replace(/\r$/, ''));
  const skip = frontMatterLines(lines);
  let offset = 0;
  let fence: string | null = null;
  // Where the paragraph the line belongs to starts: a setext underline makes
  // that paragraph a heading.
  let paragraph: number | null = null;
  lines.forEach((line, i) => {
    const at = offset;
    offset += raws[i]!.length + 1;
    if (i < skip) return;
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== null) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
      return;
    }
    if (marker) {
      fence = marker;
      paragraph = null;
      return;
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (heading) {
      headings.push({ level: heading[1]!.length, title: (heading[2] ?? '').trim(), from: at, target: true });
      paragraph = null;
      return;
    }
    const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
    if (underline && paragraph !== null) {
      headings.push({ level: underline[1]![0] === '=' ? 1 : 2, title: '', from: paragraph, target: false });
      paragraph = null;
      return;
    }
    // A list item or a quote is not a paragraph: a line of - under it is a
    // thematic break.
    if (line.trim() === '' || LIST_OR_QUOTE.test(line)) paragraph = null;
    else paragraph ??= at;
  });

  const targets: Target[] = [];
  headings.forEach((heading, i) => {
    if (!heading.target || heading.level < 2 || heading.level > 3) return;
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
export function findTarget(text: string, template: Template, name: string): FoundTarget {
  const targets = targetsOf(text, template);
  const sceneId = template.kind === 'adventure' ? new RegExp(`^${escape(template.ids.scene)}\\d+$`) : null;
  const wanted = name.trim();
  const matches = targets.filter((t) =>
    t.kind === 'scene' && sceneId?.test(t.target)
      ? t.target.toLowerCase() === wanted.toLowerCase()
      : sameName(t.target, wanted),
  );
  if (matches.length === 1) return { ok: true, target: matches[0]! };
  if (matches.length === 0) return { ok: false, error: 'unknown_target', targets };
  return { ok: false, error: 'ambiguous_target', targets: matches };
}
