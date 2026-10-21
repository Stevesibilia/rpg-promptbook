import { useEffect, useId, useRef, useState } from 'react';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Problem, Severity } from 'promptbook-format';
import { dateAndTime, snoozeDate } from '../dates.js';
import { analysisField } from './analysis/field.js';
import { hiddenOf, problemsOf, type Shown } from './cm/hidden.js';
import type { HideAs } from './cm/problems.js';
import { Section, useViewValue } from './InspectorSection.js';
import { outlineOf, type OutlineItem } from './outline.js';
import { ProblemMenu } from './ProblemMenu.js';
import type { UpdateSource } from './StatusBar.js';
import { jumpTo } from './writes.js';

export interface Row {
  message: string;
  severity: Severity;
  where: string;
  from: number;
  to: number;
  // The problem's fingerprint, and the problem and the text it was computed
  // for, which a hide is keyed against.
  key: string;
  problem: Problem;
  text: string;
}

export interface HiddenRow extends Row {
  // «Dismissed», «Snoozed until Wed 28 Oct».
  status: string;
  // The snooze's end with its time.
  title: string | undefined;
}

export interface CheckRows {
  shown: Row[];
  hidden: HiddenRow[];
}

// What the page does with a problem (hide-problems design decision 14).
export interface Hiding {
  hide(problem: Problem, text: string, as: HideAs): void;
  restore(key: string): void;
  restoreAll(keys: readonly string[]): void;
}

// Where a problem is: its scene, else its section or the front matter (a
// sheet's problem is placed in its section, as in the mockup), and its line.
function whereOf(items: readonly OutlineItem[], pos: number, line: number): string {
  let owner: OutlineItem | null = null;
  for (const item of items) {
    if (item.kind === 'sheet') continue;
    if (item.from <= pos && pos <= item.to && (!owner || item.depth >= owner.depth)) owner = item;
  }
  const place = owner ? (owner.kind === 'scene' ? (owner.id ?? owner.name) : owner.place) : null;
  return place ? `${place} · line ${line}` : `Line ${line}`;
}

const byPlace = (a: Row, b: Row) => a.from - b.from;

// Every problem of the latest analysis, shown and hidden apart, each in
// document order at its position in the current text.
export function rowsOf(state: EditorState): CheckRows {
  const value = state.field(analysisField, false);
  const parts = problemsOf(state);
  if (!value || !parts) return { shown: [], hidden: [] };
  const items = outlineOf(state);
  const length = state.doc.length;
  const { now } = hiddenOf(state);
  const row = ({ problem, index, key }: Shown): Row => {
    const spot = value.spots[index] ?? { from: problem.range.start.offset, to: problem.range.end.offset };
    const from = Math.min(spot.from, length);
    const to = Math.min(Math.max(spot.to, from), length);
    return {
      message: problem.message,
      severity: problem.severity,
      where: whereOf(items, from, state.doc.lineAt(from).number),
      from,
      to,
      key,
      problem,
      text: parts.text,
    };
  };
  return {
    shown: parts.shown.map(row).sort(byPlace),
    hidden: parts.hidden
      .map((h): HiddenRow => {
        const snoozed = h.entry.how === 'snoozed';
        return {
          ...row(h),
          status: snoozed ? `Snoozed until ${snoozeDate(h.entry.until!, now)}` : 'Dismissed',
          title: snoozed ? dateAndTime(h.entry.until!) : undefined,
        };
      })
      .sort(byPlace),
  };
}

const sameRow = (r: Row, s: Row) =>
  r.key === s.key &&
  r.message === s.message &&
  r.severity === s.severity &&
  r.where === s.where &&
  r.from === s.from &&
  r.to === s.to;

const sameRows = (a: CheckRows, b: CheckRows) =>
  a.shown.length === b.shown.length &&
  a.hidden.length === b.hidden.length &&
  a.shown.every((r, i) => sameRow(r, b.shown[i]!)) &&
  a.hidden.every((r, i) => sameRow(r, b.hidden[i]!) && r.status === b.hidden[i]!.status && r.title === b.hidden[i]!.title);

// A row's identity: its key, and which of the rows with that key it is (two
// identical problems on identical lines share a key). Stable while problems
// come and go above it, so its buttons, and the menu's, stay in place.
const idsOf = (rows: readonly Row[]): string[] => {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const n = seen.get(row.key) ?? 0;
    seen.set(row.key, n + 1);
    return `${row.key}#${n}`;
  });
};

const none: CheckRows = { shown: [], hidden: [] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Dot({ severity }: { severity: Severity }) {
  return <span className={`dot${severity === 'error' ? ' err' : ''}`} />;
}

// «Hidden (n)» under the list: dimmed rows with their status and Restore,
// «Restore all» from two. Absent when nothing is hidden.
export function HiddenList({
  rows,
  open,
  flash = false,
  onToggle,
  onSelect,
  onRestore,
  onRestoreAll,
}: {
  rows: readonly HiddenRow[];
  open: boolean;
  flash?: boolean;
  onToggle(open: boolean): void;
  onSelect(row: Row): void;
  onRestore(row: HiddenRow, index: number): void;
  onRestoreAll(): void;
}) {
  const uid = useId();
  if (rows.length === 0) return null;
  const ids = idsOf(rows);
  return (
    <details className={`hid${flash ? ' flash' : ''}`} open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>Hidden ({rows.length})</summary>
      <div className="hlist">
        {rows.map((row, i) => (
          <div className="prow" key={ids[i]}>
            <button className="prob" onClick={() => onSelect(row)}>
              <Dot severity={row.severity} />
              <span>
                <span id={`${uid}h${i}`}>{row.message}</span>
                <span className="where">{row.where}</span>
                <span className="hstat" title={row.title}>
                  {row.status}
                </span>
              </span>
            </button>
            <button className="restore" aria-describedby={`${uid}h${i}`} onClick={() => onRestore(row, i)}>
              Restore
            </button>
          </div>
        ))}
      </div>
      {rows.length >= 2 && (
        <button className="linkbtn" onClick={onRestoreAll}>
          Restore all
        </button>
      )}
    </details>
  );
}

// Where the focus goes once a row has left its list: the row now in its
// place, else the one before, else the section's heading.
type Refocus = { list: 'shown' | 'hidden'; index: number };

// Checks (design decision 8): every shown problem with its place, a click
// selects it in the editor, an empty range selects the rest of its line;
// each row's «⋯» snoozes or dismisses it. The hidden ones are listed under
// them (hide-problems design decision 8).
export function Checks({
  view,
  updates,
  open,
  onToggle,
  hiding,
  hiddenOpen,
  onHiddenToggle,
  flash = false,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  open: boolean;
  onToggle(open: boolean): void;
  hiding: Hiding;
  hiddenOpen: boolean;
  onHiddenToggle(open: boolean): void;
  flash?: boolean;
}) {
  const read = useViewValue(view, updates, rowsOf, sameRows);
  const rows = read ?? none;
  const { shown, hidden } = rows;
  const errors = shown.filter((r) => r.severity === 'error').length;
  const warnings = shown.length - errors;
  const ids = idsOf(shown);
  const [menu, setMenu] = useState<{ id: string; index: number; anchor: HTMLButtonElement } | null>(null);
  const menuId = useId();
  const host = useRef<HTMLDivElement>(null);
  const refocus = useRef<Refocus | null>(null);

  // «Hidden» is collapsed again once nothing is hidden, as at first.
  const empty = read !== null && hidden.length === 0;
  useEffect(() => {
    if (empty && hiddenOpen) onHiddenToggle(false);
  }, [empty, hiddenOpen, onHiddenToggle]);

  // A row that leaves the list, here or on another device, takes its menu;
  // the focus it held goes to the row in its place.
  const menuAt = menu ? ids.indexOf(menu.id) : -1;
  const menuRow = menuAt < 0 ? undefined : shown[menuAt];
  useEffect(() => {
    if (!menu || menuRow) return;
    if (document.activeElement?.closest('.pmenu')) refocus.current = { list: 'shown', index: menu.index };
    setMenu(null);
  }, [menu, menuRow]);

  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    const body = host.current?.closest('details.checks');
    if (!body) return;
    const selector = target.list === 'shown' ? '.plist > .prow > .prob' : '.hlist > .prow > .restore';
    const list = [...body.querySelectorAll<HTMLElement>(selector)];
    const next =
      list[Math.min(target.index, list.length - 1)] ??
      (target.list === 'hidden' ? body.querySelector<HTMLElement>('.hid > summary') : null) ??
      body.querySelector<HTMLElement>(':scope > summary');
    next?.focus();
  }, [rows]);

  function select(row: Row) {
    if (!view) return;
    const to = row.to > row.from ? row.to : view.state.doc.lineAt(row.from).to;
    jumpTo(view, row.from, 'center', to);
  }

  function choose(as: HideAs) {
    if (!menuRow) return;
    // The focus was on the menu: it goes to the row taking this one's place.
    refocus.current = { list: 'shown', index: menuAt };
    setMenu(null);
    hiding.hide(menuRow.problem, menuRow.text, as);
  }

  function closeMenu(refocusButton: boolean) {
    const anchor = menu?.anchor;
    setMenu(null);
    if (refocusButton) anchor?.focus();
  }

  return (
    <Section
      className="checks"
      open={open}
      onToggle={onToggle}
      summary={
        <>
          Checks{' '}
          <span className="cnt">
            {shown.length === 0 ? (
              'none'
            ) : (
              <>
                {errors > 0 && <span className="d">{plural(errors, 'error')}</span>}
                {errors > 0 && warnings > 0 && ' · '}
                {warnings > 0 && <span className="a">{plural(warnings, 'warning')}</span>}
              </>
            )}
          </span>
        </>
      }
    >
      <div ref={host} className="plist">
        {shown.length === 0 ? (
          <p className="hint">No problems found.</p>
        ) : (
          shown.map((row, i) => {
            const expanded = menu?.id === ids[i];
            return (
              <div className="prow" key={ids[i]}>
                <button className="prob" onClick={() => select(row)}>
                  <Dot severity={row.severity} />
                  <span>
                    <span id={`${menuId}s${i}`}>{row.message}</span>
                    <span className="where">{row.where}</span>
                  </span>
                </button>
                <button
                  className="more"
                  aria-haspopup="menu"
                  aria-expanded={expanded}
                  aria-controls={expanded ? menuId : undefined}
                  aria-label="More actions"
                  aria-describedby={`${menuId}s${i}`}
                  title="Snooze or dismiss"
                  onClick={(e) => setMenu(expanded ? null : { id: ids[i]!, index: i, anchor: e.currentTarget })}
                >
                  ⋯
                </button>
              </div>
            );
          })
        )}
      </div>
      <HiddenList
        rows={hidden}
        open={hiddenOpen}
        flash={flash}
        onToggle={onHiddenToggle}
        onSelect={select}
        onRestore={(row, index) => {
          refocus.current = { list: 'hidden', index };
          hiding.restore(row.key);
        }}
        onRestoreAll={() => {
          refocus.current = { list: 'hidden', index: 0 };
          hiding.restoreAll(hidden.map((r) => r.key));
        }}
      />
      {menu && menuRow && (
        <ProblemMenu id={menuId} anchor={menu.anchor} onChoose={choose} onClose={closeMenu} />
      )}
    </Section>
  );
}
