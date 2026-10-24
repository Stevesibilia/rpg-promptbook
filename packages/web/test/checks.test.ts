import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagnosticCount, forEachDiagnostic, type Diagnostic } from '@codemirror/lint';
import { ChangeSet, StateEffect, type EditorState } from '@codemirror/state';
import { hideProblem, readHidden, SNOOZE_MS, type HiddenHow } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { analysisField, setAnalysis } from '../src/editor/analysis/field.js';
import { HiddenList, rowsOf, type HiddenRow } from '../src/editor/Checks.js';
import { hiddenField, problemsOf, setHidden } from '../src/editor/cm/hidden.js';
import { hiddenEffects, pushDiagnostics } from '../src/editor/cm/problems.js';
import { menuHints } from '../src/editor/ProblemMenu.js';
import { snapshotOf } from '../src/editor/StatusBar.js';
import { analysed } from './analysed.js';

// Hidden problems in the editor (hide-problems design decisions 8, 11, 12):
// Checks' rows, the status bar's counts, the diagnostics, the menu's hints.

// Wed 21 Oct 2026, 15:00 local time, as in the mockup.
const now = new Date(2026, 9, 21, 15, 0);

const UNKNOWN = 'scene.field.unknown'; // «Se il tempo stringe» in S5, an error with a fix
const THREAT = 'ref.threat.outside'; // a warning in S5
const SECTION = 'section.missing'; // an error in the front matter

// Sabaoth analysed, with the hidden-problems field, and the project's Y.Doc
// its hides are written to.
function setup(): { state: EditorState; doc: Y.Doc } {
  const { state } = analysed(sabaoth);
  return { state: state.update({ effects: StateEffect.appendConfig.of(hiddenField) }).state, doc: new Y.Doc() };
}

// Hides the first problem with `code`, as the page does, and sets the hidden
// state from the document, at `at`.
function hide(state: EditorState, doc: Y.Doc, code: string, how: HiddenHow = 'dismissed', at = now): EditorState {
  const { result, doc: text } = state.field(analysisField);
  const problem = result!.problems.find((p) => p.code === code)!;
  const until = how === 'snoozed' ? new Date(at.getTime() + SNOOZE_MS.week).toISOString() : null;
  hideProblem(doc, problem, text!.toString(), how, until, at);
  return state.update({ effects: setHidden.of({ entries: readHidden(doc), now: at }) }).state;
}

const hiddenRow = (message: string, status: string): HiddenRow => ({
  message,
  severity: 'warning',
  where: 'S5 · line 269',
  from: 0,
  to: 0,
  key: message,
  problem: null as never,
  text: '',
  status,
  title: undefined,
});

const list = (rows: HiddenRow[]) =>
  renderToStaticMarkup(
    createElement(HiddenList, {
      rows,
      open: true,
      onToggle() {},
      onSelect() {},
      onRestore() {},
      onRestoreAll() {},
    }),
  );

describe('Checks rows', () => {
  it('lists every problem as shown when nothing is hidden', () => {
    const { state } = setup();
    const rows = rowsOf(state);
    expect(rows.shown).toHaveLength(5);
    expect(rows.hidden).toEqual([]);
  });

  it('splits shown and hidden rows, each in document order, with their status', () => {
    let { state, doc } = setup();
    state = hide(state, doc, UNKNOWN);
    state = hide(state, doc, THREAT, 'snoozed');
    const rows = rowsOf(state);
    expect(rows.shown.map((r) => r.problem.code)).toEqual([
      'section.missing',
      'limit.preamble.words',
      'sheet.nested-threat',
    ]);
    expect(rows.hidden.map((r) => [r.problem.code, r.status])).toEqual([
      [THREAT, 'Snoozed until Wed 28 Oct'],
      [UNKNOWN, 'Dismissed'],
    ]);
    expect(rows.hidden[0]!.title).toMatch(/^28 Oct 2026 · \d\d:\d\d$/);
    expect(rows.hidden[1]!.title).toBeUndefined();
    expect(rows.hidden[1]!.where).toMatch(/^S5 · line \d+$/);
  });

  it('shows a snoozed problem again once its snooze has ended', () => {
    let { state, doc } = setup();
    state = hide(state, doc, THREAT, 'snoozed');
    expect(rowsOf(state).hidden).toHaveLength(1);
    const later = new Date(now.getTime() + SNOOZE_MS.week);
    state = state.update({ effects: setHidden.of({ entries: readHidden(doc), now: later }) }).state;
    expect(rowsOf(state).hidden).toEqual([]);
    expect(rowsOf(state).shown).toHaveLength(5);
  });

  it('keeps the hide when the text changes elsewhere and a new result comes', () => {
    let { state, doc } = setup();
    state = hide(state, doc, UNKNOWN);
    state = state.update({ changes: { from: 0, insert: '\n' } }).state;
    const text = state.doc.toString();
    const result = analysed(text).result;
    state = state.update({
      effects: setAnalysis.of({ doc: state.doc, result, changes: ChangeSet.empty(state.doc.length) }),
    }).state;
    expect(rowsOf(state).hidden.map((r) => r.problem.code)).toEqual([UNKNOWN]);
  });
});

describe('the row menu', () => {
  it('hints when each snooze would end', () => {
    expect(menuHints(now)).toEqual({ day: 'until Thu 22 Oct', week: 'until Wed 28 Oct' });
  });
});

describe('the hidden problems list', () => {
  it('is absent when nothing is hidden', () => {
    expect(list([])).toBe('');
  });

  it('lists each with its status and Restore, and Restore all only from two', () => {
    const one = list([hiddenRow('A', 'Dismissed')]);
    expect(one).toContain('Hidden (1)');
    expect(one).toContain('Dismissed');
    expect(one).toContain('>Restore<');
    expect(one).not.toContain('Restore all');
    const two = list([hiddenRow('A', 'Dismissed'), hiddenRow('B', 'Snoozed until Wed 28 Oct')]);
    expect(two).toContain('Hidden (2)');
    expect(two).toContain('Snoozed until Wed 28 Oct');
    expect(two).toContain('Restore all');
  });
});

describe('the status bar', () => {
  it('counts shown problems and the hidden ones apart', () => {
    let { state, doc } = setup();
    expect(snapshotOf(state)).toMatchObject({ template: 'Avventura v1', errors: 2, warnings: 3, hidden: 0 });
    state = hide(state, doc, UNKNOWN);
    state = hide(state, doc, THREAT, 'snoozed');
    expect(snapshotOf(state)).toMatchObject({ errors: 1, warnings: 2, hidden: 2 });
  });
});

describe('the diagnostics', () => {
  const diagnostics = (state: EditorState) => {
    const out: Diagnostic[] = [];
    forEachDiagnostic(state, (d) => out.push(d));
    return out;
  };
  const pushed = (state: EditorState) =>
    state.update({ effects: pushDiagnostics(state, state.field(analysisField).result!, true) }).state;

  it('leave out hidden problems', () => {
    let { state, doc } = setup();
    expect(diagnosticCount(pushed(state))).toBe(5);
    state = hide(state, doc, UNKNOWN);
    const shown = diagnostics(pushed(state));
    expect(shown).toHaveLength(4);
    expect(shown.map((d) => d.source)).not.toContain(UNKNOWN);
  });

  it('offer the quick fixes, then «Snooze a week» and «Dismiss», with the code', () => {
    const { state } = setup();
    const unknown = diagnostics(pushed(state)).find((d) => d.source === UNKNOWN)!;
    const names = unknown.actions!.map((a) => a.name);
    expect(names.slice(-2)).toEqual(['Snooze a week', 'Dismiss']);
    expect(names).toHaveLength(3);
  });

  it('are rebuilt when the hidden problems change on a fresh result, and left to the next result when stale', () => {
    let { state, doc } = setup();
    state = pushed(state);
    const { result, doc: text } = state.field(analysisField);
    hideProblem(doc, result!.problems.find((p) => p.code === SECTION)!, text!.toString(), 'dismissed', null, now);
    const fresh = state.update({ effects: hiddenEffects(state, { entries: readHidden(doc), now }) }).state;
    expect(diagnosticCount(fresh)).toBe(4);
    expect(problemsOf(fresh)!.hidden).toHaveLength(1);

    // A change that shows and hides nothing new leaves the diagnostics, and
    // an open tooltip, alone.
    expect(hiddenEffects(fresh, { entries: readHidden(doc), now: new Date(now.getTime() + 1) })).toHaveLength(1);

    const typed = state.update({ changes: { from: state.doc.length, insert: '\n' } }).state;
    const stale = typed.update({ effects: hiddenEffects(typed, { entries: readHidden(doc), now }) }).state;
    expect(diagnosticCount(stale)).toBe(5);
    expect(problemsOf(stale)!.hidden).toHaveLength(1);
  });
});
