import { parseAdventure, templateChanges, type Problem, type Template, type TextEdit } from 'promptbook-format';

// What «Update to <name> vN» shows (mockup state 8, design decisions 10 and
// 19): the headings the update would add and rename, and how the checks'
// errors and warnings change.

export interface UpdatePlan {
  // «## Atmosfera» after «Verità del mondo»; `after` null at the start.
  added: { heading: string; after: string | null }[];
  // Section headings and scene field labels the new version renames.
  renamed: { before: string; after: string; what: 'section' | 'field' }[];
}

export function updatePlan(from: Template, to: Template): UpdatePlan {
  const changes = templateChanges(from, to);
  const added = new Set(changes.filter((c) => c.what === 'section' && c.kind === 'added').map((c) => c.label));
  const plan: UpdatePlan = { added: [], renamed: [] };
  to.sections.forEach((section, index) => {
    if (!added.has(section.name)) return;
    const previous = to.sections
      .slice(0, index)
      .reverse()
      .find((s) => !added.has(s.name));
    plan.added.push({ heading: section.heading ?? section.name, after: previous ? (previous.heading ?? previous.name) : null });
  });
  for (const change of changes) {
    if (change.detail !== 'renamed' || change.before === undefined) continue;
    if (change.what === 'section' || change.what === 'field') {
      plan.renamed.push({ before: change.before, after: change.label, what: change.what });
    }
  }
  return plan;
}

export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let out = text;
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to);
  }
  return out;
}

export interface ChecksAfter {
  errors: number;
  warnings: number;
  // The messages of the problems the update brings, as the checks word
  // them.
  fresh: string[];
}

const count = (problems: readonly Problem[], severity: Problem['severity']) =>
  problems.filter((p) => p.severity === severity).length;

// The difference in the checks between the text on `from` now and the text
// with the edits on `to`: positive counts are new problems.
export function checksAfter(text: string, from: Template, to: Template, edits: readonly TextEdit[]): ChecksAfter | null {
  if (from.kind !== 'adventure' || to.kind !== 'adventure') return null;
  const before = parseAdventure(text, { template: from }).problems;
  const after = parseAdventure(applyEdits(text, edits), { template: to }).problems;
  // A problem by what it is and where, not by its message: the message
  // quotes labels the update may rename.
  const key = (p: Problem) => `${p.severity}|${p.code}|${p.sceneId ?? ''}`;
  const known = new Map<string, number>();
  for (const p of before) known.set(key(p), (known.get(key(p)) ?? 0) + 1);
  const fresh: string[] = [];
  for (const p of after) {
    const left = known.get(key(p)) ?? 0;
    if (left > 0) known.set(key(p), left - 1);
    else fresh.push(p.message.replace(/\.$/, ''));
  }
  return {
    errors: count(after, 'error') - count(before, 'error'),
    warnings: count(after, 'warning') - count(before, 'warning'),
    fresh,
  };
}

const n = (value: number, word: string) => `${Math.abs(value)} ${word}${Math.abs(value) === 1 ? '' : 's'}`;

// «1 new warning», «2 fewer errors», «no change».
export function checksText({ errors, warnings }: ChecksAfter): string {
  const parts: string[] = [];
  if (errors) parts.push(errors > 0 ? `${n(errors, 'new error')}` : `${n(errors, 'error')} fewer`);
  if (warnings) parts.push(warnings > 0 ? `${n(warnings, 'new warning')}` : `${n(warnings, 'warning')} fewer`);
  return parts.length ? parts.join(', ') : 'no change in the checks';
}
