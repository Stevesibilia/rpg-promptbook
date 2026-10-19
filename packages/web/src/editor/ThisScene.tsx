import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { templates, type CalloutDefinition, type Requirement } from 'promptbook-format';
import { analysisField } from './analysis/field.js';
import { keyLabel, shortcut } from './cm/keymap.js';
import { Section, useViewValue } from './InspectorSection.js';
import { READ_ALOUD_AFTER, readAloudOf, type Insert } from './inserts.js';
import { currentItem } from './outline.js';
import type { UpdateSource } from './StatusBar.js';
import { applyInsert } from './writes.js';

const template = templates.avventura;
const readAloud = readAloudOf(template);

// The scene holding the cursor, from the latest analysis (fresh or stale):
// what it has of the template.
interface SceneSnapshot {
  id: string | null;
  fields: string[];
  readAloud: boolean;
}

function sceneOf(state: EditorState): SceneSnapshot | null {
  const item = currentItem(state);
  const model = state.field(analysisField, false)?.result?.model;
  if (item?.kind !== 'scene' || !model) return null;
  const scene = model.scenes[item.index]!;
  return {
    id: scene.id,
    fields: scene.fields.filter((f) => f.known).map((f) => f.label),
    readAloud: !!scene.readAloud,
  };
}

const sameScene = (a: SceneSnapshot | null, b: SceneSnapshot | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.id === b.id &&
    a.readAloud === b.readAloud &&
    a.fields.length === b.fields.length &&
    a.fields.every((f, i) => f === b.fields[i]));

interface Row {
  key: string;
  name: string;
  note?: string;
  requirement: Requirement;
  present: boolean;
  insert: Insert;
}

// The template's scene fields in order, with the read-aloud box after the
// field it follows.
function rowsOf(scene: SceneSnapshot): Row[] {
  const rows: Row[] = [];
  for (const field of template.sceneFields) {
    rows.push({
      key: field.label,
      name: field.label,
      requirement: field.requirement,
      present: scene.fields.includes(field.label),
      insert: { kind: 'field', label: field.label },
    });
    if (field.label === READ_ALOUD_AFTER) rows.push(readAloudRow(scene));
  }
  if (!rows.some((r) => r.key === readAloud.type)) rows.push(readAloudRow(scene));
  return rows;
}

function readAloudRow(scene: SceneSnapshot): Row {
  const { min, max } = readAloud.perPlace;
  return {
    key: readAloud.type,
    name: readAloud.label,
    note: `[!${readAloud.type}]${max === null ? '' : ` · ${max} per scene`}`,
    requirement: min > 0 ? 'required' : 'optional',
    present: scene.readAloud,
    insert: { kind: 'readAloud' },
  };
}

const callout = (role: CalloutDefinition['role'], column: CalloutDefinition['column'] = 'main') =>
  template.callouts.find((c) => c.role === role && c.column === column)!;

// The buttons under the fields, with the mockup's colour marks.
const snippets: { label: string; mark: string; insert: Insert }[] = [
  { label: 'Read-aloud', mark: 'l', insert: { kind: 'callout', callout: readAloud } },
  { label: 'Handout', mark: 'd', insert: { kind: 'callout', callout: callout('handout') } },
  { label: 'Box', mark: 'b', insert: { kind: 'callout', callout: callout('box') } },
  { label: 'Side box', mark: 'b', insert: { kind: 'callout', callout: callout('box', 'side') } },
  { label: '→ Sheet', mark: '', insert: { kind: 'sheetRef' } },
  { label: 'Reactions table', mark: '', insert: { kind: 'reactions' } },
];

const classOf = (row: Row) =>
  [row.requirement === 'required' ? 'req' : row.requirement === 'optional' ? 'opt' : '', row.present ? '' : 'miss']
    .filter(Boolean)
    .join(' ');

// This scene (design decision 8): the template's fields ticked or missing,
// with Insert, and the insert buttons.
export function ThisScene({
  view,
  updates,
  open,
  onToggle,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  open: boolean;
  onToggle(open: boolean): void;
}) {
  const scene = useViewValue(view, updates, sceneOf, sameScene);
  const run = (insert: Insert) => view && applyInsert(view, insert, template);

  return (
    <Section
      className="this-scene"
      open={open}
      onToggle={onToggle}
      summary={
        <>
          This scene{scene?.id ? ` · ${scene.id}` : ''} <span className="cnt">template rules</span>
        </>
      }
    >
      {scene ? (
        <>
          <ul className="rules">
            {rowsOf(scene).map((row) => (
              <li key={row.key} className={classOf(row)}>
                {row.present ? <span className="ok">✓</span> : <span className="no">○</span>}
                <span className="nm">
                  {row.name}
                  {row.note && <span className="mk"> {row.note}</span>}
                </span>
                {!row.present && (
                  <button className="ins" title={`Insert «${row.name}»`} onClick={() => run(row.insert)}>
                    Insert
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="snips">
            {snippets.map((s) => (
              <button key={s.label} className={`snip ${s.mark}`} onClick={() => run(s.insert)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="hint">
            Full syntax: <span className="kbd">{keyLabel(shortcut('syntax').keys)}</span> · type{' '}
            <span className="kbd">/</span> at the start of a line to insert
          </div>
        </>
      ) : (
        <p className="hint">Put the cursor in a scene to see its fields.</p>
      )}
    </Section>
  );
}
