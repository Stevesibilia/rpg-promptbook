import { parseAdventure, templates, type Problem } from 'promptbook-format';
import { findTarget, targetsOf, type Category, type Target } from 'promptbook-project';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { openLiveDocument } from '../live.js';
import type { ProjectRow } from '../projects.js';
import { insertSnapshot, pruneClaudeSnapshots, snapshotThenWrite, textHash } from '../snapshots.js';
import type { Sync } from '../sync.js';
import { ToolRefusal } from './errors.js';

// Claude's edits of the prep document, one target at a time (connector design
// decisions 5 and 13): never over text Claude has not read, always after a snapshot of the text it replaces, always through the
// live document.

export const MARKDOWN_MAX = 100_000;

// A problem as a model reads it.
export interface ProblemOut {
  code: string;
  severity: Problem['severity'];
  message: string;
  line: number;
}

const problemOut = (p: Problem): ProblemOut => ({
  code: p.code,
  severity: p.severity,
  message: p.message,
  line: p.range.start.line,
});

export interface Check {
  errors: number;
  warnings: number;
  problems: Problem[];
}

// The checks of an adventure or a one-shot; null for a campaign, which is
// never parsed.
export function check(text: string, category: Category): Check | null {
  if (category === 'campaign') return null;
  const { problems } = parseAdventure(text, { template: templates.avventura });
  return {
    errors: problems.filter((p) => p.severity === 'error').length,
    warnings: problems.filter((p) => p.severity === 'warning').length,
    problems,
  };
}

const inSpan = (problems: Problem[], from: number, to: number) =>
  problems.filter((p) => p.range.start.offset >= from && p.range.start.offset <= to);

export const CHANGED_SINCE_READ = () =>
  new AppError(409, 'changed_since_read', 'The section changed since you read it; read it again.');

const targetList = (targets: Target[]) => targets.map((t) => ({ kind: t.kind, target: t.target, title: t.title }));

// The one target a name finds, or the refusal that lists the valid ones.
export function locate(text: string, category: Category, name: string): Target {
  const found = findTarget(text, category, name);
  if (found.ok) return found.target;
  const names = found.targets.map((t) => t.target).join(', ');
  if (found.error === 'unknown_target') {
    throw new ToolRefusal(
      404,
      'unknown_target',
      `There is no target «${name}» in this document. Valid targets: ${names || 'none'}.`,
      { targets: targetList(found.targets) },
      'target',
    );
  }
  throw new ToolRefusal(
    409,
    'ambiguous_target',
    `«${name}» names more than one target: ${names}. Use get_outline and name one exactly.`,
    { targets: targetList(found.targets) },
    'target',
  );
}

const isSpace = (char: string | undefined) => char === ' ' || char === '\t' || char === '\r' || char === '\n';

// Trailing blank lines and spaces dropped: a span never has them, so the
// separator after the target stays as it was. Scans, never a regex: one
// anchored at the end is quadratic on a long run of spaces.
function withoutTrailingBlanks(markdown: string): string {
  let end = markdown.length;
  while (end > 0 && isSpace(markdown[end - 1])) end--;
  return markdown.slice(0, end);
}

// Leading blank lines dropped; the spaces that indent the first line kept.
function withoutLeadingBlankLines(markdown: string): string {
  let start = 0;
  for (let i = 0; i < markdown.length && isSpace(markdown[i]); i++) {
    if (markdown[i] === '\n') start = i + 1;
  }
  return markdown.slice(start);
}

// A heading line is short; a longer one is refused before any regex sees it.
export const HEADING_LINE_MAX = 300;

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

function invalidMarkdown(message: string): ToolRefusal {
  return new ToolRefusal(400, 'invalid_markdown', message, undefined, 'markdown');
}

// The new text must open with a heading of the target's level, and for a
// scene with the same id.
function checkHeading(markdown: string, target: Target): void {
  const newline = markdown.indexOf('\n');
  const line = (newline === -1 ? markdown : markdown.slice(0, newline)).replace(/\r$/, '');
  if (line.length > HEADING_LINE_MAX) {
    throw invalidMarkdown(`The heading line is longer than ${HEADING_LINE_MAX} characters.`);
  }
  const heading = HEADING.exec(line);
  if (!heading || heading[1]!.length !== target.level) {
    throw invalidMarkdown(
      `The markdown must start with the target's heading, a level ${target.level} heading (${'#'.repeat(target.level)} …).`,
    );
  }
  if (target.kind === 'scene' && /^S\d+$/i.test(target.target)) {
    const id = /^(S\d+)\b/i.exec(heading[2]!)?.[1];
    if (id?.toUpperCase() !== target.target.toUpperCase()) {
      throw invalidMarkdown(`A scene keeps its id: the heading must start with ### ${target.target}.`);
    }
  }
}

// What the checks say before and after an edit. Problems never refuse it:
// they are reported, and the caller fixes them in later edits.
interface Report {
  errorsBefore: number | null;
  warningsBefore: number | null;
  errors: number | null;
  warnings: number | null;
  problems: ProblemOut[];
}

function report(before: string, after: string, category: Category, from: number, to: number): Report {
  const old = check(before, category);
  const next = check(after, category);
  return {
    errorsBefore: old?.errors ?? null,
    warningsBefore: old?.warnings ?? null,
    errors: next?.errors ?? null,
    warnings: next?.warnings ?? null,
    problems: next ? inSpan(next.problems, from, to).map(problemOut) : [],
  };
}

// After the edit, the target must read as exactly the text written, so its
// hash is the one undo checks: a new heading inside it, or a renamed one,
// would leave the edit unfindable.
function spanAfter(text: string, category: Category, name: string, from: number, to: number): Target {
  const found = findTarget(text, category, name);
  if (!found.ok || found.target.from !== from || found.target.to !== to) {
    throw invalidMarkdown(
      'The markdown must be exactly one target: keep its heading as it is, and add no heading of the same or a higher level inside it.',
    );
  }
  return found.target;
}

export interface EditResult {
  target: string;
  title: string;
  hash: string;
  snapshotId: string;
  errorsBefore: number | null;
  warningsBefore: number | null;
  errors: number | null;
  warnings: number | null;
  problems: ProblemOut[];
}

interface Planned {
  text: string;
  label: string;
  target: string;
  beforeSection: string;
  afterHash: string;
  result: Omit<EditResult, 'snapshotId'>;
}

// Snapshots the text the plan replaces and writes the planned text, once:
// a text that moved after the plan was made is changed_since_read, and the
// caller reads it again. `plan` runs on the live text and refuses by
// throwing.
async function apply(
  db: Db,
  sync: Sync,
  project: ProjectRow,
  userId: string,
  grantId: string,
  tool: 'replace_section' | 'add_scene',
  plan: (text: string) => Planned,
): Promise<EditResult> {
  const live = await openLiveDocument(sync, project.id, userId);
  try {
    let planned!: Planned;
    const stored = await snapshotThenWrite(db, live, {
      attempts: 1,
      moved: CHANGED_SINCE_READ,
      next: (text) => {
        planned = plan(text);
        return planned.text;
      },
      snapshot: (text) =>
        insertSnapshot(db, {
          projectId: project.id,
          kind: 'claude',
          label: planned.label,
          text,
          category: project.category,
          tool,
          target: planned.target,
          beforeSection: planned.beforeSection,
          afterHash: planned.afterHash,
          grantId,
        }),
    });
    await pruneClaudeSnapshots(db, project.id);
    return { ...planned.result, snapshotId: stored.id };
  } finally {
    await live.close();
  }
}

const labelOf = (target: string, title: string) => (title && title !== target ? `${target} · ${title}` : target);

export function replaceSection(
  db: Db,
  sync: Sync,
  project: ProjectRow,
  userId: string,
  grantId: string,
  input: { target: string; markdown: string; hash: string },
): Promise<EditResult> {
  const markdown = withoutTrailingBlanks(input.markdown);
  return apply(db, sync, project, userId, grantId, 'replace_section', (text) => {
    const target = locate(text, project.category, input.target);
    const before = text.slice(target.from, target.to);
    // The caller's hash, checked against the live text every time.
    if (textHash(before) !== input.hash.toLowerCase()) throw CHANGED_SINCE_READ();
    checkHeading(markdown, target);
    const next = text.slice(0, target.from) + markdown + text.slice(target.to);
    const end = target.from + markdown.length;
    const after = spanAfter(next, project.category, target.target, target.from, end);
    const reported = report(text, next, project.category, target.from, end);
    const afterHash = textHash(markdown);
    return {
      text: next,
      label: labelOf(target.target, after.title),
      target: target.target,
      beforeSection: before,
      afterHash,
      result: {
        target: target.target,
        title: after.title,
        hash: afterHash,
        ...reported,
      },
    };
  });
}

export function addScene(
  db: Db,
  sync: Sync,
  project: ProjectRow,
  userId: string,
  grantId: string,
  input: { title: string; markdown: string },
): Promise<EditResult> {
  if (project.category === 'campaign') {
    throw new AppError(400, 'not_an_adventure', 'A campaign has no scenes; add_scene works on adventures and one-shots.');
  }
  const body = withoutLeadingBlankLines(withoutTrailingBlanks(input.markdown));
  const title = input.title.trim();
  return apply(db, sync, project, userId, grantId, 'add_scene', (text) => {
    const { model } = parseAdventure(text, { template: templates.avventura });
    const section = model.sections.find((s) => s.role === 'scenes');
    if (!section) {
      throw new AppError(409, 'no_scene_section', 'This document has no «Scene» section to add a scene to.');
    }
    const highest = Math.max(0, ...model.scenes.map((s) => Number(/^S(\d+)$/i.exec(s.id ?? '')?.[1] ?? 0)));
    const id = `S${highest + 1}`;
    // After the last scene, or at the end of the «Scene» section.
    const targets = targetsOf(text, project.category);
    const place =
      targets.filter((t) => t.kind === 'scene').at(-1) ??
      targets.find((t) => t.kind === 'section' && t.target === section.id);
    if (!place) throw new Error('The «Scene» section has no span');
    const at = place.to;
    const scene = `### ${id}. ${title}${body ? `\n\n${body}` : ''}`;
    const next = `${text.slice(0, at)}\n\n${scene}${text.slice(at)}`;
    const from = at + 2;
    const end = from + scene.length;
    const after = spanAfter(next, project.category, id, from, end);
    const reported = report(text, next, project.category, from, end);
    const afterHash = textHash(scene);
    return {
      text: next,
      label: labelOf(id, after.title),
      target: id,
      beforeSection: '',
      afterHash,
      result: {
        target: id,
        title: after.title,
        hash: afterHash,
        ...reported,
      },
    };
  });
}
