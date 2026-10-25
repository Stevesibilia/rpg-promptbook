import { useState, type Dispatch, type FormEvent, type ReactNode } from 'react';
import type { AdventureTemplate, Place, SectionRole, Template } from 'promptbook-format';
import { isLocked, keyRenamable, warnsOnDashes, type DraftAction, type ListItems, type ListName } from './draft.js';
import { placeName } from './changes.js';
import { rowMarks, type Mark } from './marks.js';

// The editor's tabs (mockup states 3 to 6), one component each: the rows of
// a list, with ▲▼, the name, «Needed», «Used for» with its lock, ✕, and an
// «+ Add …» field under them. Changed rows get an amber bar, added ones a
// green one.

interface TabProps {
  draft: Template;
  saved: Template;
  dispatch: Dispatch<DraftAction>;
  readOnly: boolean;
  // A uid for an item the user adds (design decision 7).
  newUid(): string;
}

const REQUIREMENTS = ['required', 'recommended', 'optional'] as const;

const sectionRoles: Record<SectionRole, string> = {
  synopsis: 'Synopsis',
  backstory: 'Backstory',
  overview: 'Overview',
  reminders: 'Reminders',
  clock: 'Clock',
  truths: 'Truths',
  strongStart: 'Strong start',
  sceneMap: 'Scene map',
  rules: 'Rules',
  scenes: 'Scenes',
  clues: 'Clues',
  npcs: 'NPCs',
  sheets: 'Sheets',
  before: 'Before the session',
  appendix: 'Appendix',
};

const fieldRoles: Record<string, string> = {
  place: 'Place and time',
  inPlay: 'In play',
  mustHave: 'Must have',
  happens: 'What happens',
  cast: 'Cast',
  clues: 'Clues',
  tests: 'Tests',
  derail: 'Derailing',
  situation: 'Situation rules',
  decides: 'What it decides',
};

const keyRoles: Record<string, string> = { title: 'Title', subtitle: 'Subtitle', system: 'Game system' };

const LOCKED_TIP = 'Needed by the checks and the PDF: set it optional instead';

export function LockIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function Role({ name, title }: { name: string | null; title: string }) {
  return (
    <span className={`role${name ? '' : ' custom'}`} title={title}>
      {name ? (
        <>
          <LockIcon />
          {name}
        </>
      ) : (
        'Your own'
      )}
    </span>
  );
}

const markClass = (mark: Mark | null | undefined) => (mark === 'added' ? ' added' : mark === 'changed' ? ' changed' : '');

function Move({ list, index, count, dispatch, readOnly, label }: {
  list: ListName;
  index: number;
  count: number;
  dispatch: Dispatch<DraftAction>;
  readOnly: boolean;
  label: string;
}) {
  if (readOnly) return <span />;
  return (
    <span className="mv">
      <button
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => dispatch({ type: 'move', list, index, by: -1 })}
      >
        ▲
      </button>
      <button
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => dispatch({ type: 'move', list, index, by: 1 })}
      >
        ▼
      </button>
    </span>
  );
}

function Remove({ list, index, locked, lockedTip, label, dispatch, readOnly }: {
  list: ListName;
  index: number;
  locked: boolean;
  lockedTip: string;
  label: string;
  dispatch: Dispatch<DraftAction>;
  readOnly: boolean;
}) {
  if (readOnly) return <span />;
  return (
    <button
      className="del"
      aria-label={`Remove ${label}`}
      title={locked ? lockedTip : `Remove ${label}`}
      disabled={locked}
      onClick={() => dispatch({ type: 'remove', list, index })}
    >
      ✕
    </button>
  );
}

function Needed({ value, label, onChange, readOnly }: {
  value: string;
  label: string;
  onChange(value: string): void;
  readOnly: boolean;
}) {
  return (
    <select aria-label={`Needed: ${label}`} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
      {REQUIREMENTS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

// The «+ Add …» field under a list.
function Add({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd(name: string): void }) {
  const [value, setValue] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    onAdd(value);
    setValue('');
  };
  return (
    <form className="add" onSubmit={submit}>
      <input placeholder={placeholder} aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="tb line" type="submit" disabled={!value.trim()}>
        Add
      </button>
    </form>
  );
}

function Rows({ grid, head, children, footer }: { grid: string; head: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="rows">
      <div className={`rh ${grid}`} aria-hidden="true">
        {head}
      </div>
      {children}
      {footer}
    </div>
  );
}

function patch<L extends ListName>(dispatch: Dispatch<DraftAction>, list: L, index: number) {
  return (value: Partial<ListItems[L]>) => dispatch({ type: 'patch', list, index, patch: value as Record<string, unknown> });
}

export function SectionsTab({ draft, saved, dispatch, readOnly, newUid }: TabProps) {
  const marks = rowMarks(saved, draft, 'sections');
  const campaign = draft.kind === 'campaign';
  return (
    <>
      <Rows
        grid="g-sec"
        head={
          <>
            <span />
            <span>Heading</span>
            <span>Needed</span>
            <span>Used for</span>
            <span />
          </>
        }
        footer={
          readOnly ? null : (
            <Add
              placeholder="+ Add a section, e.g. Atmosfera"
              label="New section"
              onAdd={(name) => dispatch({ type: 'add', list: 'sections', name, uid: newUid() })}
            />
          )
        }
      >
        {draft.sections.map((s, i) => {
          const set = patch(dispatch, 'sections', i);
          const role = s.role ? sectionRoles[s.role] : null;
          return (
            <div className={`rr g-sec${markClass(marks[i])}`} key={s.uid ?? s.role ?? `${i}`} data-testid="section-row">
              <Move list="sections" index={i} count={draft.sections.length} dispatch={dispatch} readOnly={readOnly} label={s.name} />
              <input
                aria-label="Heading"
                value={s.heading ?? s.name}
                disabled={readOnly}
                onChange={(e) => {
                  // A heading that said more than the name («Appendice:
                  // immagini e musica») is edited whole; the name follows
                  // up to the colon, as the parser matches it.
                  const value = e.target.value;
                  if (s.heading === undefined) return set({ name: value });
                  const name = value.split(':')[0]!.trim();
                  set({ name, heading: value });
                }}
              />
              <Needed value={s.requirement} label={s.name} readOnly={readOnly} onChange={(v) => set({ requirement: v as never })} />
              <Role
                name={role}
                title={
                  role
                    ? 'The checks and the PDF find this section by its role, whatever its heading says'
                    : 'Your own section: checked for presence only'
                }
              />
              <Remove
                list="sections"
                index={i}
                locked={isLocked('sections', s)}
                lockedTip={LOCKED_TIP}
                label={s.name}
                dispatch={dispatch}
                readOnly={readOnly}
              />
            </div>
          );
        })}
      </Rows>
      <p className="sub">
        {campaign
          ? 'Campaigns have no PDF yet; their sections are checked for presence only.'
          : 'Renaming a section with a role keeps it working: the checks and the PDF follow the role.'}
      </p>
    </>
  );
}

export function FieldsTab({ draft, saved, dispatch, readOnly, newUid }: TabProps & { draft: AdventureTemplate }) {
  const marks = rowMarks(saved, draft, 'sceneFields');
  return (
    <>
      <Rows
        grid="g-fld"
        head={
          <>
            <span />
            <span>Bold label in a scene</span>
            <span>Form</span>
            <span>Needed</span>
            <span>Used for</span>
            <span>Climax</span>
            <span />
          </>
        }
        footer={
          readOnly ? null : (
            <Add
              placeholder="+ Add a scene field, e.g. Atmosfera"
              label="New scene field"
              onAdd={(name) => dispatch({ type: 'add', list: 'sceneFields', name, uid: newUid() })}
            />
          )
        }
      >
        {draft.sceneFields.map((f, i) => {
          const set = patch(dispatch, 'sceneFields', i);
          const role = f.role ? (fieldRoles[f.role] ?? f.role) : null;
          return (
            <div className={`rr g-fld${markClass(marks[i])}`} key={f.uid ?? f.role ?? `${i}`} data-testid="field-row">
              <Move list="sceneFields" index={i} count={draft.sceneFields.length} dispatch={dispatch} readOnly={readOnly} label={f.label} />
              <input aria-label="Label" value={f.label} disabled={readOnly} onChange={(e) => set({ label: e.target.value })} />
              <select aria-label={`Form: ${f.label}`} value={f.form} disabled={readOnly} onChange={(e) => set({ form: e.target.value as never })}>
                <option value="inline">inline</option>
                <option value="block">block</option>
              </select>
              <Needed value={f.requirement} label={f.label} readOnly={readOnly} onChange={(v) => set({ requirement: v as never })} />
              <Role
                name={role}
                title={role ? 'The checks and the scene page find this field by its role, whatever its label says' : 'Your own field'}
              />
              <label className="role">
                <input
                  type="checkbox"
                  checked={f.climax}
                  disabled={readOnly}
                  aria-label={`Climax only: ${f.label}`}
                  onChange={(e) => set({ climax: e.target.checked })}
                />{' '}
                only
              </label>
              <Remove
                list="sceneFields"
                index={i}
                locked={isLocked('sceneFields', f)}
                lockedTip={LOCKED_TIP}
                label={f.label}
                dispatch={dispatch}
                readOnly={readOnly}
              />
            </div>
          );
        })}
      </Rows>
      <p className="sub">
        <b>Inline</b>: <code>**Label:** text</code> on one line. <b>Block</b>: <code>**Label**</code> then a list or a
        table. <b>Climax only</b>: expected in the last scene, allowed in any.
      </p>
    </>
  );
}

const lookNames = { readAloud: 'read-aloud', handout: 'handout', box: 'box' } as const;

// Every place a box may be allowed in: scenes, sheets, any section, and each
// section with a role the draft has.
function placesOf(draft: AdventureTemplate): Place[] {
  return ['scene', 'sheet', 'anySection', ...draft.sections.flatMap((s) => (s.role ? [s.role] : []))];
}

export function BoxesTab({ draft, saved, dispatch, readOnly, newUid }: TabProps & { draft: AdventureTemplate }) {
  const marks = rowMarks(saved, draft, 'callouts');
  return (
    <>
      <Rows
        grid="g-box"
        head={
          <>
            <span>Box</span>
            <span>Look</span>
            <span>Column</span>
            <span>Allowed in</span>
            <span>Per place</span>
            <span />
          </>
        }
        footer={
          readOnly ? null : (
            <Add
              placeholder="+ Add a box type, e.g. mappa"
              label="New box type"
              onAdd={(name) => dispatch({ type: 'add', list: 'callouts', name, uid: newUid() })}
            />
          )
        }
      >
        {draft.callouts.map((c, i) => {
          const set = patch(dispatch, 'callouts', i);
          const type = c.meta ? `${c.type}|${c.meta}` : c.type;
          const left = placesOf(draft).filter((p) => !c.allowedIn.includes(p));
          const { min, max } = c.perPlace;
          return (
            <div className={`rr g-box${markClass(marks[i])}`} key={c.uid ?? type} data-testid="box-row">
              <span className="box-name">
                <code>[!{type}]</code>
                <input aria-label={`Label of [!${type}]`} value={c.label} disabled={readOnly} onChange={(e) => set({ label: e.target.value })} />
              </span>
              <select aria-label={`Look: ${c.label}`} value={c.role} disabled={readOnly} onChange={(e) => set({ role: e.target.value as never })}>
                {Object.entries(lookNames).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
              <select aria-label={`Column: ${c.label}`} value={c.column} disabled={readOnly} onChange={(e) => set({ column: e.target.value as never })}>
                <option value="main">main</option>
                <option value="side">side</option>
              </select>
              <span className="places">
                {c.allowedIn.map((p) => (
                  <button
                    key={p}
                    className="tg on"
                    disabled={readOnly || c.allowedIn.length === 1}
                    title={readOnly ? undefined : c.allowedIn.length === 1 ? 'A box needs at least one place' : 'Remove this place'}
                    aria-label={`${placeName(p, draft)}: remove from ${c.label}`}
                    onClick={() => set({ allowedIn: c.allowedIn.filter((x) => x !== p) })}
                  >
                    {placeName(p, draft)}
                    {!readOnly && c.allowedIn.length > 1 && <span aria-hidden="true"> ✕</span>}
                  </button>
                ))}
                {!readOnly && left.length > 0 && (
                  <select
                    className="tg add-place"
                    aria-label={`Add a place to ${c.label}`}
                    value=""
                    onChange={(e) => e.target.value && set({ allowedIn: [...c.allowedIn, e.target.value as Place] })}
                  >
                    <option value="">+ place</option>
                    {left.map((p) => (
                      <option key={p} value={p}>
                        {placeName(p, draft)}
                      </option>
                    ))}
                  </select>
                )}
              </span>
              <select
                aria-label={`Per place: ${c.label}`}
                value={max === null ? String(min ? 1 : 0) : 'range'}
                disabled={readOnly || max !== null}
                onChange={(e) => set({ perPlace: { min: Number(e.target.value), max: null } })}
              >
                <option value="0">any</option>
                <option value="1">at least 1</option>
                {max !== null && <option value="range">{`${min} to ${max}`}</option>}
              </select>
              <Remove
                list="callouts"
                index={i}
                locked={isLocked('callouts', c)}
                lockedTip="Each place needs one: set it to «any» first"
                label={c.label}
                dispatch={dispatch}
                readOnly={readOnly}
              />
            </div>
          );
        })}
      </Rows>
      <p className="sub">
        Written as <code>&gt; [!type] Title</code>. The look of each kind (read-aloud, handout, box) stays the app's.
      </p>
    </>
  );
}

export function KeysTab({ draft, saved, dispatch, readOnly, newUid }: TabProps) {
  const marks = rowMarks(saved, draft, 'meta');
  return (
    <>
      <Rows
        grid="g-key"
        head={
          <>
            <span />
            <span>Key</span>
            <span>Type</span>
            <span>Needed</span>
            <span>Used for</span>
            <span />
          </>
        }
        footer={
          readOnly ? null : (
            <Add
              placeholder="+ Add a key, e.g. luogo"
              label="New front matter key"
              onAdd={(name) => dispatch({ type: 'add', list: 'meta', name, uid: newUid() })}
            />
          )
        }
      >
        {draft.meta.map((k, i) => {
          const set = patch(dispatch, 'meta', i);
          const locked = isLocked('meta', k);
          const role = k.role ? keyRoles[k.role]! : locked ? 'Read by the app' : null;
          return (
            <div className={`rr g-key${markClass(marks[i])}`} key={k.uid ?? k.key} data-testid="key-row">
              <Move list="meta" index={i} count={draft.meta.length} dispatch={dispatch} readOnly={readOnly} label={k.key} />
              <input
                aria-label="Key"
                value={k.key}
                disabled={readOnly || !keyRenamable(k)}
                title={!readOnly && !keyRenamable(k) ? 'The app reads this key by its name' : undefined}
                onChange={(e) => set({ key: e.target.value })}
              />
              <select aria-label={`Type: ${k.key}`} value={k.type} disabled={readOnly} onChange={(e) => set({ type: e.target.value as never })}>
                <option value="text">text</option>
                <option value="list">list</option>
                <option value="licence">licence</option>
              </select>
              <Needed value={k.requirement} label={k.key} readOnly={readOnly} onChange={(v) => set({ requirement: v as never })} />
              <Role name={role} title={role ? 'The app reads this key by its name' : 'Your own key'} />
              <Remove
                list="meta"
                index={i}
                locked={locked}
                lockedTip="The app reads this key: set it optional instead"
                label={k.key}
                dispatch={dispatch}
                readOnly={readOnly}
              />
            </div>
          );
        })}
      </Rows>
    </>
  );
}

// A whole number typed in a limits field. The text is the input's own while
// the user types (it may be empty for a moment); a good number goes to the
// draft, and a discard or a reset shows the draft's value again.
function NumberInput({ value, label, onChange, readOnly, min = 1 }: {
  value: number;
  label: string;
  onChange(value: number): void;
  readOnly: boolean;
  min?: number;
}) {
  const [text, setText] = useState(String(value));
  const parsed = Number(text);
  if (text !== '' && Number.isInteger(parsed) && parsed >= min && parsed !== value) {
    // The draft moved under the input (Discard): follow it.
    if (String(value) !== text) setText(String(value));
  }
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      step={1}
      value={text}
      disabled={readOnly}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isInteger(n) && n >= min) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export function LimitsTab({ draft, dispatch, readOnly }: TabProps & { draft: AdventureTemplate }) {
  const l = draft.limits;
  const set = (patch: Partial<AdventureTemplate['limits']>) => dispatch({ type: 'limits', patch });
  return (
    <div className="rows">
      <div className="lim">
        <div className="field">
          <span className="label">Synopsis length (words)</span>
          <span className="pair">
            <NumberInput
              label="Synopsis, at least"
              min={0}
              value={l.synopsisWords.min}
              readOnly={readOnly}
              onChange={(min) => set({ synopsisWords: { ...l.synopsisWords, min } })}
            />{' '}
            to{' '}
            <NumberInput
              label="Synopsis, at most"
              value={l.synopsisWords.max}
              readOnly={readOnly}
              onChange={(max) => set({ synopsisWords: { ...l.synopsisWords, max } })}
            />
          </span>
        </div>
        <div className="field">
          <span className="label">Text before the scenes (words, at most)</span>
          <span className="pair">
            <NumberInput label="Text before the scenes" value={l.preambleWords} readOnly={readOnly} onChange={(preambleWords) => set({ preambleWords })} />
          </span>
        </div>
        <div className="field">
          <span className="label">Reminders, at most</span>
          <span className="pair">
            <NumberInput label="Reminders" value={l.reminders} readOnly={readOnly} onChange={(reminders) => set({ reminders })} />
          </span>
        </div>
        <div className="field">
          <span className="label">Each revelation: clues and scenes, at least</span>
          <span className="pair">
            <NumberInput label="Clues per revelation" value={l.revelationClues} readOnly={readOnly} onChange={(revelationClues) => set({ revelationClues })} />{' '}
            clues{' '}
            <NumberInput label="Scenes per revelation" value={l.revelationScenes} readOnly={readOnly} onChange={(revelationScenes) => set({ revelationScenes })} />{' '}
            scenes
          </span>
        </div>
        <div className="field">
          <span className="label">Style</span>
          <label className="chk">
            <input
              type="checkbox"
              checked={warnsOnDashes(draft)}
              disabled={readOnly}
              onChange={(e) => dispatch({ type: 'dashes', on: e.target.checked })}
            />{' '}
            Warn on em and en dashes
          </label>
        </div>
      </div>
    </div>
  );
}
