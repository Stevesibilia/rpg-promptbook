import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { EditorSelection, type EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { AdventureTemplate, CalloutDefinition, Model, Place } from 'promptbook-format';
import { analysisField, writableResult } from '../analysis/field.js';
import { insertText, nextSceneNumber, placeInsert, sceneAt, type Insert } from '../inserts.js';
import { currentItem } from '../outline.js';
import { frontMatterOf } from './preview.js';
import { write } from '../writes.js';

// The `/` insert menu and the sheet names' completion (design decision 9).

export type SlashInsert = Insert | { kind: 'heading'; level: 2 | 3 };

export interface SlashEntry {
  label: string;
  detail: string;
  group: 'missing' | 'insert' | 'headings';
  insert: SlashInsert;
}

const groups: Record<SlashEntry['group'], { name: string; rank: number }> = {
  missing: { name: 'Missing fields', rank: 0 },
  insert: { name: 'Insert', rank: 1 },
  headings: { name: 'Headings', rank: 2 },
};

// The `/` line holding `pos`: a `/` alone at the start of the line, then
// what was typed after it to narrow the menu, with the cursor at its end.
export function slashLine(state: EditorState, pos: number): { from: number; to: number; query: string } | null {
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) return null;
  const match = /^\/([^/]*)$/.exec(line.text);
  return match ? { from: line.from, to: line.to, query: match[1]! } : null;
}

const headings: SlashEntry[] = [
  { label: 'Section heading', detail: '##', group: 'headings', insert: { kind: 'heading', level: 2 } },
  { label: 'Subheading', detail: '###', group: 'headings', insert: { kind: 'heading', level: 3 } },
];

const calloutSyntax = (c: CalloutDefinition) => `> [!${c.meta ? `${c.type}|${c.meta}` : c.type}]`;

// What the menu offers at `pos`, from the latest analysis (fresh or stale:
// it only lists; choosing an entry parses again). In a scene, its missing
// fields first, then the callouts allowed there and not yet at their limit,
// the sheet reference, the reactions table when it has none, and New scene;
// in a section, the callouts allowed in it, and New scene in the scenes
// section. A campaign gets the two headings.
export function slashEntries(state: EditorState, pos: number, template: AdventureTemplate): SlashEntry[] {
  const value = state.field(analysisField, false);
  if (!value?.checked) {
    const fm = frontMatterOf(state.doc);
    return fm && pos <= fm.to ? [] : headings;
  }
  const model = value.result?.model;
  const item = model ? currentItem(state, pos) : null;
  if (!model || !item) return [];

  const callouts = (allowed: (places: readonly Place[]) => boolean, count: (c: CalloutDefinition) => number) =>
    template.callouts
      .filter((c) => allowed(c.allowedIn) && (c.perPlace.max === null || count(c) < c.perPlace.max))
      .map((c): SlashEntry => ({
        label: c.label,
        detail: calloutSyntax(c),
        group: 'insert',
        insert: { kind: 'callout', callout: c },
      }));
  const newScene = (): SlashEntry => ({
    label: 'New scene',
    detail: insertText({ kind: 'scene' }, template, model).text.trim(),
    group: 'insert',
    insert: { kind: 'scene' },
  });

  if (item.kind === 'scene') {
    const scene = model.scenes[item.index]!;
    const present = new Set(scene.fields.filter((f) => f.known).map((f) => f.label));
    const count = (c: CalloutDefinition) =>
      scene.boxes.filter((b) => b.kind === 'callout' && b.type === c.type && b.meta === (c.meta ?? null)).length;
    return [
      ...template.sceneFields
        .filter((f) => !present.has(f.label))
        .map((f): SlashEntry => ({
          label: f.label,
          detail: f.requirement,
          group: 'missing',
          insert: { kind: 'field', label: f.label },
        })),
      ...callouts((places) => places.includes('scene'), count),
      { label: 'Sheet reference', detail: template.references.marker, group: 'insert', insert: { kind: 'sheetRef' } },
      ...(scene.reactions
        ? []
        : [
            {
              label: 'Reactions table',
              detail: `| ${template.tables.reactions.firstHeader}… |`,
              group: 'insert' as const,
              insert: { kind: 'reactions' as const },
            },
          ]),
      newScene(),
    ];
  }
  if (item.kind === 'section') {
    const role = model.sections[item.index]!.role;
    return [
      ...callouts(
        (places) => places.includes('anySection') || (!!role && places.includes(role)),
        () => 0,
      ),
      ...(role === 'scenes' ? [newScene()] : []),
    ];
  }
  if (item.kind === 'sheet') {
    return callouts(
      (places) => places.includes('sheet') || places.includes('anySection'),
      () => 0,
    );
  }
  return [];
}

// Replaces the `/` line with the chosen insert, from a result that is never
// stale. Nothing happens when the line under the menu is no longer a `/`
// line (another tab changed it).
export function applySlash(view: EditorView, insert: SlashInsert, template: AdventureTemplate): void {
  const { state } = view;
  const slash = slashLine(state, state.selection.main.head);
  if (!slash) return;
  if (insert.kind === 'heading') {
    const text = `${'#'.repeat(insert.level)} `;
    write(view, [{ from: slash.from, to: slash.to, insert: text }], {
      selection: EditorSelection.single(slash.from + text.length),
      userEvent: 'input.complete',
    });
    return;
  }
  const result = writableResult(state);
  if (!result) return;
  const existing = insert.kind === 'field' ? existingField(result.model, slash.from, insert.label) : null;
  if (existing !== null) {
    // Listed from an older analysis; the field is there now: no second copy,
    // the `/` goes and the cursor moves to the field.
    const at = existing > slash.from ? existing - (slash.to - slash.from) : existing;
    write(view, [{ from: slash.from, to: slash.to, insert: '' }], {
      selection: EditorSelection.single(at),
      userEvent: 'input.complete',
      scroll: true,
    });
    return;
  }
  const placed = placeInsert(insert, {
    text: state.doc.toString(),
    model: result.model,
    template,
    pos: slash.from,
    at: { from: slash.from, to: slash.to },
  });
  if (!placed) return;
  write(view, [placed.edit], {
    selection: EditorSelection.single(placed.cursor),
    userEvent: 'input.complete',
    scroll: true,
  });
  if (placed.complete) startCompletion(view);
}

function existingField(model: Model, pos: number, label: string): number | null {
  const scene = model.scenes[sceneAt(model, pos)];
  const field = scene?.fields.find((f) => f.known && f.label === label);
  return field ? field.range.start.offset : null;
}

function slashResult(template: AdventureTemplate, context: CompletionContext): CompletionResult | null {
  const slash = slashLine(context.state, context.pos);
  if (!slash) return null;
  const entries = slashEntries(context.state, slash.from, template);
  if (!entries.length) return null;
  return {
    from: slash.from + 1,
    to: context.pos,
    // Narrowed by CodeMirror as the user types, without asking again, so
    // Enter right after typing picks from the menu shown; the boost keeps
    // the order above.
    validFor: /^[^/]*$/,
    options: entries.map((entry, i): Completion => ({
      label: entry.label,
      detail: entry.detail,
      section: groups[entry.group],
      boost: Math.max(-99, 99 - i),
      apply: (view) => applySlash(view, entry.insert, template),
    })),
  };
}

// The text after the references marker on the cursor's line, up to the
// cursor: what a sheet name completes. Null past a comma or a bracket,
// where the name has ended.
export function sheetQuery(state: EditorState, pos: number, marker: string): { from: number; query: string } | null {
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const at = before.lastIndexOf(`${marker} `);
  if (at < 0) return null;
  const from = at + marker.length + 1;
  const query = before.slice(from);
  if (/[,;()«»]/.test(query)) return null;
  return { from: line.from + from, query };
}

// The sheet names of the latest analysis.
export function sheetNames(state: EditorState): string[] {
  const sheets = state.field(analysisField, false)?.result?.model.sheets ?? [];
  return [...new Set(sheets.map((s) => s.name))];
}

function sheetResult(template: AdventureTemplate, context: CompletionContext): CompletionResult | null {
  const at = sheetQuery(context.state, context.pos, template.references.marker);
  if (!at) return null;
  const names = sheetNames(context.state);
  if (!names.length) return null;
  return {
    from: at.from,
    to: context.pos,
    validFor: /^[^,;()«»]*$/,
    // In the order of the document.
    options: names.map((label, i) => ({ label, boost: Math.max(-99, 99 - i) })),
  };
}

// One source for both: a second source would be asked again at every
// keystroke, and while it is pending CodeMirror disables the open menu, so
// Enter typed quickly after a letter would insert a line break.
function source(template: AdventureTemplate, checked: boolean): CompletionSource {
  return (context) => slashResult(template, context) ?? (checked ? sheetResult(template, context) : null);
}

// The completion: the `/` menu, and for an adventure or a one-shot the sheet
// names; a campaign's menu has the headings only. No delays: CodeMirror
// queries after 100 ms without typing and ignores Enter for 75 ms after the
// menu opens, so a quick «/new⏎» would type a line break.
export function slashMenu(template: AdventureTemplate, checked: boolean): Extension {
  return autocompletion({
    override: [source(template, checked)],
    icons: false,
    activateOnTypingDelay: 0,
    interactionDelay: 0,
  });
}
