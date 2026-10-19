import { useState } from 'react';
import {
  addLogEntry,
  addQuestionsToTodo,
  readLog,
  removeLogEntry,
  updateLogEntry,
  type LogEntry,
  type Rejected,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { dateAndTime } from '../dates.js';
import { useDocValue } from '../sync/hooks.js';
import { Confirm } from '../ui/Confirm.js';
import { InfoIcon, PlusIcon } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';
import { checkEntry, entryDraftOf, newEntryDraft, type EntryDraft } from './draft.js';

// The Brainstorm log view (connector specs, brainstorm-log): dated entries,
// newest first, each editable, deletable, with its open questions to the
// to-do list.
export function LogView({ doc }: { doc: Y.Doc }) {
  const entries = useDocValue(doc, readLog);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [deleting, setDeleting] = useState<LogEntry | null>(null);
  const [toast, showToast] = useToast();

  const toTodo = (entry: LogEntry) => {
    const added = addQuestionsToTodo(doc, entry.id).length;
    if (added) showToast(`${added} open question${added === 1 ? '' : 's'} added to the to-do list.`);
  };

  return (
    <div className="pane narrow-pane">
      <div className="head">
        <h1>Brainstorm log</h1>
        <p className="lead">Dated entries, newest first. Claude writes one at the end of a chat; you can too.</p>
        <span className="spacer" />
        <button className="tb line" disabled={draft !== null} onClick={() => setDraft(newEntryDraft())}>
          <PlusIcon />
          New entry
        </button>
      </div>
      <div className="info">
        <InfoIcon className="ic" />A new chat with Claude reads this log first.
      </div>
      {draft?.id === null && <EntryEditor doc={doc} draft={draft} setDraft={setDraft} current={null} />}
      {/* An entry deleted elsewhere while it was being edited. */}
      {draft?.id && !entries.some((e) => e.id === draft.id) && (
        <EntryEditor doc={doc} draft={draft} setDraft={setDraft} current={null} />
      )}
      {entries.length === 0 && draft?.id !== null && <p className="empty-line">No entries yet.</p>}
      {entries.map((entry) =>
        draft?.id === entry.id ? (
          <EntryEditor key={entry.id} doc={doc} draft={draft} setDraft={setDraft} current={entry} />
        ) : (
          <Entry
            key={entry.id}
            entry={entry}
            // One entry at a time, so a draft is never dropped unseen.
            busy={draft !== null}
            onEdit={() => setDraft(entryDraftOf(entry))}
            onDelete={() => setDeleting(entry)}
            onTodo={() => toTodo(entry)}
          />
        ),
      )}
      {deleting && (
        <Confirm
          title="Delete this entry?"
          action="Delete"
          danger
          note="A new chat with Claude will no longer read it."
          onConfirm={() => {
            removeLogEntry(doc, deleting.id);
            if (draft?.id === deleting.id) setDraft(null);
          }}
          onClose={() => setDeleting(null)}
        >
          «{deleting.title}» leaves the brainstorm log.
        </Confirm>
      )}
      {toast}
    </div>
  );
}

function Part({ kind, title, items }: { kind: string; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={`part ${kind}`}>
      <h6>{title}</h6>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function RejectedPart({ items }: { items: Rejected[] }) {
  if (items.length === 0) return null;
  return (
    <div className="part r">
      <h6>Rejected</h6>
      <ul>
        {items.map((r, i) => (
          <li key={i}>
            {r.idea}
            {r.why && <span className="why">Why: {r.why}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Entry({
  entry,
  busy,
  onEdit,
  onDelete,
  onTodo,
}: {
  entry: LogEntry;
  busy: boolean;
  onEdit(): void;
  onDelete(): void;
  onTodo(): void;
}) {
  const questions = entry.questions.filter((q) => q.trim() !== '');
  return (
    <div className="card entry">
      <div className="eh">
        <span className="dt">{dateAndTime(entry.at)}</span>
        <h3>{entry.title}</h3>
        <span className={`who-chip ${entry.by === 'claude' ? 'cl' : 'you'}`}>
          {entry.by === 'claude' ? 'via Claude' : 'by you'}
        </span>
      </div>
      <div className="parts">
        <Part kind="i" title="Ideas" items={entry.ideas} />
        <Part kind="d" title="Decisions" items={entry.decisions} />
        <RejectedPart items={entry.rejected} />
        <Part kind="o" title="Open questions" items={entry.questions} />
      </div>
      <div className="eacts">
        <button
          className="tb sm line"
          disabled={busy}
          title={busy ? 'Finish the entry you are editing first' : undefined}
          onClick={onEdit}
        >
          Edit
        </button>
        <button className="tb sm danger" onClick={onDelete}>
          Delete
        </button>
        <span className="spacer" />
        {entry.todoAdded ? (
          <button className="tb sm line" disabled>
            Added to the to-do list ✓
          </button>
        ) : (
          questions.length > 0 && (
            <button className="tb sm line" onClick={onTodo}>
              Add open questions to the to-do list
            </button>
          )
        )}
      </div>
    </div>
  );
}

function Lines({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={3} placeholder="One per line" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function EntryEditor({
  doc,
  draft,
  setDraft,
  current,
}: {
  doc: Y.Doc;
  draft: EntryDraft;
  setDraft(draft: EntryDraft | null): void;
  // The entry as it is now; null for a new one or one deleted meanwhile.
  current: LogEntry | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<EntryDraft>) => setDraft({ ...draft, ...patch });
  const setRejected = (i: number, patch: Partial<Rejected>) =>
    set({ rejected: draft.rejected.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const gone = draft.id !== null && !current;
  const changed = !!current && JSON.stringify(current) !== draft.base;

  const done = () => {
    const checked = checkEntry(draft);
    if (!checked.ok) return setError(checked.error);
    try {
      if (current) updateLogEntry(doc, current.id, checked.entry);
      else addLogEntry(doc, { ...checked.entry, by: 'user', at: draft.at });
    } catch (e) {
      return setError(e instanceof Error ? e.message : 'The entry could not be saved.');
    }
    setDraft(null);
  };

  return (
    <div className="card entry editing">
      <div className="eh">
        <span className="dt">{dateAndTime(draft.at)}</span>
        <span className="who-chip you">{current?.by === 'claude' ? 'via Claude' : 'by you'}</span>
      </div>
      {gone && (
        <p className="warn-line" role="alert">
          This entry was deleted in another tab. Done saves your text as a new entry.
        </p>
      )}
      {changed && (
        <p className="warn-line" role="alert">
          This entry changed elsewhere since you began; Done replaces it with your text.
        </p>
      )}
      <div className="field">
        <label htmlFor="entry-title">Title</label>
        <input id="entry-title" autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="parts">
        <Lines id="entry-ideas" label="Ideas" value={draft.ideas} onChange={(ideas) => set({ ideas })} />
        <Lines
          id="entry-decisions"
          label="Decisions"
          value={draft.decisions}
          onChange={(decisions) => set({ decisions })}
        />
        <div className="field">
          <span className="label">Rejected</span>
          {draft.rejected.map((r, i) => (
            <div className="rej-edit" key={i}>
              <input
                aria-label="Rejected idea"
                placeholder="Idea"
                value={r.idea}
                onChange={(e) => setRejected(i, { idea: e.target.value })}
              />
              <input
                aria-label="Why"
                placeholder="Why"
                value={r.why}
                onChange={(e) => setRejected(i, { why: e.target.value })}
              />
              <button
                className="tb sm"
                aria-label="Remove this idea"
                title="Remove this idea"
                onClick={() => set({ rejected: draft.rejected.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <div>
            <button
              className="tb sm line"
              onClick={() => set({ rejected: [...draft.rejected, { idea: '', why: '' }] })}
            >
              <PlusIcon />
              Add a rejected idea
            </button>
          </div>
        </div>
        <Lines
          id="entry-questions"
          label="Open questions"
          value={draft.questions}
          onChange={(questions) => set({ questions })}
        />
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="eacts">
        <button className="tb sm primary" onClick={done}>
          Done
        </button>
        <button className="tb sm line" onClick={() => setDraft(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
