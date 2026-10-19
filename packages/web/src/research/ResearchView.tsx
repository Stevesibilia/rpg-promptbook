import { useDeferredValue, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  addTopic,
  isWebUrl,
  readDocument,
  readNotes,
  readTopics,
  removeNote,
  removeTopic,
  saveNote,
  setTopicState,
  targetsOf,
  updateNote,
  type ProjectMeta,
  type ResearchNote,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { longDate, longDay } from '../dates.js';
import { hostOf } from '../inspiration/links.js';
import { useDocValue } from '../sync/hooks.js';
import { Confirm } from '../ui/Confirm.js';
import { PlusIcon } from '../ui/icons.js';
import { checkDraft, draftOf, emptyDraft, type NoteDraft } from './draft.js';
import { scenesFor, type SceneText } from './match.js';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const byWho = (note: ResearchNote) => (note.by === 'claude' ? 'Claude' : 'you');
const sourcesCount = (n: number) => `${n} source${n === 1 ? '' : 's'}`;

// The scenes of an adventure or a one-shot with their text, for «mentioned
// in»; none for a campaign.
function scenesOf(text: string, category: ProjectMeta['category']): SceneText[] {
  if (category === 'campaign') return [];
  return targetsOf(text, category)
    .filter((t) => t.kind === 'scene')
    .map((t) => ({ id: t.target, text: text.slice(t.from, t.to) }));
}

// The Research view (connector specs, research): topics to research, the
// notes, and the selected note, read or edited.
export function ResearchView({ doc, meta }: { doc: Y.Doc; meta: ProjectMeta }) {
  const notes = useDocValue(doc, readNotes);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('note');
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const select = (id: string | null) => setParams(id ? { note: id } : {}, { replace: false });

  const selected = selectedId ? (notes.find((n) => n.id === selectedId) ?? null) : (notes[0] ?? null);
  // A draft is of the note it was opened on, or new: choosing another note
  // drops it, so a note arriving or leaving meanwhile never moves it.
  const editing = draft;
  const shownId = draft ? draft.id : (selected?.id ?? null);

  const text = useDeferredValue(useDocValue(doc, readDocument));
  const scenes = useMemo(() => scenesOf(text, meta.category), [text, meta.category]);

  const startNew = () => setDraft(emptyDraft());

  return (
    <div className="pane">
      <div className="head">
        <h1>Research</h1>
        <p className="lead">One note per topic, with sources. Prep only: never printed.</p>
        <span className="spacer" />
        <button className="tb primary" onClick={startNew} disabled={draft !== null}>
          <PlusIcon />
          New note
        </button>
      </div>
      <div className="rgrid">
        <div>
          <Topics doc={doc} title={meta.title} />
          <div className="nl" aria-label="Notes">
            {draft?.id === null && (
              <div className="nli cur">
                <b>{draft.topic.trim() || 'New note'}</b>
                <span>draft · by you</span>
              </div>
            )}
            {notes.length === 0 && draft?.id !== null && <div className="nli none">No notes yet.</div>}
            {notes.map((n) => (
              <button
                key={n.id}
                className={`nli${n.id === shownId ? ' cur' : ''}`}
                aria-current={n.id === shownId ? 'true' : undefined}
                onClick={() => {
                  // Another note leaves the edit, as Cancel does.
                  setDraft(null);
                  select(n.id);
                }}
              >
                <b>{n.topic || 'Untitled note'}</b>
                <span>
                  {longDate(n.editedAt)} ·{' '}
                  <span className={n.by === 'claude' ? 'who-cl' : 'who-you'}>by {byWho(n)}</span> ·{' '}
                  {sourcesCount(n.sources.length)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="card nd">
          {editing ? (
            <NoteEditor
              key={editing.id ?? 'new'}
              doc={doc}
              draft={editing}
              setDraft={setDraft}
              notes={notes}
              current={editing.id ? (notes.find((n) => n.id === editing.id) ?? null) : null}
              onSaved={(id) => {
                setDraft(null);
                select(id);
              }}
              onOpen={(id) => {
                setDraft(null);
                select(id);
              }}
            />
          ) : selected ? (
            <NoteDetail
              note={selected}
              mentioned={meta.category === 'campaign' ? null : scenesFor(selected.topic, scenes)}
              onEdit={() => setDraft(draftOf(selected))}
              doc={doc}
              onDeleted={() => select(null)}
            />
          ) : selectedId ? (
            <p className="empty-line">This note no longer exists: it was deleted, here or in another tab.</p>
          ) : (
            <p className="empty-line">No note selected. Press New note, or ask Claude to research a topic.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Topics({ doc, title }: { doc: Y.Doc; title: string }) {
  const topics = useDocValue(doc, readTopics);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const value = name.trim();
    if (!value) return setError('Write a topic first.');
    try {
      if (!addTopic(doc, value)) return setError(`«${value}» is already a topic.`);
    } catch (e) {
      return setError(e instanceof Error ? e.message : 'The topic could not be added.');
    }
    setName('');
    setError(null);
  };

  return (
    <div className="card">
      <div className="panel-h">Topics to research</div>
      <div className="topics">
        {topics.length === 0 && <span className="empty-line">No topics yet.</span>}
        {topics.map((t) => (
          <span key={t.id} className={`topic${t.state === 'noted' ? ' done' : ''}`}>
            <button
              className="topic-main"
              title={t.state === 'noted' ? 'Mark as to research' : 'Mark as noted'}
              onClick={() => setTopicState(doc, t.id, t.state === 'noted' ? 'open' : 'noted')}
            >
              <i />
              <span>{t.name}</span>
              <span className="s">{t.state === 'noted' ? 'noted' : 'to research'}</span>
            </button>
            <button
              className="topic-x"
              title={`Remove «${t.name}»`}
              aria-label={`Remove ${t.name}`}
              onClick={() => removeTopic(doc, t.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <input
          aria-label="Add a topic"
          placeholder="Add a topic"
          style={{ flex: 1, padding: '4px 8px' }}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="tb sm line" onClick={add}>
          Add
        </button>
      </div>
      {error && (
        <p className="err inline-err" role="alert">
          {error}
        </p>
      )}
      <div className="ask">Ask Claude: "research the open topics of {title}"</div>
      <div className="hint">Click a topic to switch its state; × removes it and keeps its notes.</div>
    </div>
  );
}

function NoteDetail({
  doc,
  note,
  mentioned,
  onEdit,
  onDeleted,
}: {
  doc: Y.Doc;
  note: ResearchNote;
  // Null for a campaign, which has no scenes to match.
  mentioned: string[] | null;
  onEdit(): void;
  onDeleted(): void;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0 }}>Topic</h4>
        <span className="row">
          <button className="tb sm line" onClick={onEdit}>
            Edit
          </button>
          <button className="tb sm danger" onClick={() => setDeleting(true)}>
            Delete
          </button>
        </span>
      </div>
      <h2>{note.topic || 'Untitled note'}</h2>
      <div className="hint" style={{ marginTop: 2 }}>
        by {note.by === 'claude' ? <span className="who-cl">Claude</span> : 'you'} · {longDate(note.editedAt)}
        {mentioned && <> · {mentioned.length ? `mentioned in ${mentioned.join(', ')}` : 'no scene yet'}</>}
      </div>
      <h4>Summary</h4>
      {note.summary ? <p className="sum">{note.summary}</p> : <p className="empty-line">No summary.</p>}
      <h4>Facts for the table</h4>
      {note.facts.length ? (
        <ul className="fact-list">
          {note.facts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-line">No facts yet.</p>
      )}
      <h4>Sources</h4>
      {note.sources.length ? (
        <ul className="src">
          {note.sources.map((s, i) => (
            <li key={i}>
              <span className="t">{s.title}</span>
              {isWebUrl(s.url) && (
                <a className="dom" href={s.url} target="_blank" rel="noopener noreferrer">
                  {hostOf(s.url)}
                </a>
              )}
              {s.accessed && <span className="acc-d">accessed {longDay(s.accessed)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-line">No sources.</p>
      )}
      {deleting && (
        <Confirm
          title="Delete this note?"
          action="Delete"
          danger
          note="The prep document is not touched."
          onConfirm={() => {
            removeNote(doc, note.id);
            onDeleted();
          }}
          onClose={() => setDeleting(false)}
        >
          «{note.topic || 'Untitled note'}» is removed from the project's research.
        </Confirm>
      )}
    </>
  );
}

function NoteEditor({
  doc,
  draft,
  setDraft,
  notes,
  current,
  onSaved,
  onOpen,
}: {
  doc: Y.Doc;
  draft: NoteDraft;
  setDraft(draft: NoteDraft | null): void;
  notes: readonly ResearchNote[];
  // The note as it is now; null for a new note or one deleted meanwhile.
  current: ResearchNote | null;
  onSaved(id: string): void;
  onOpen(id: string): void;
}) {
  const [error, setError] = useState<{ text: string; other?: ResearchNote } | null>(null);
  const set = (patch: Partial<NoteDraft>) => setDraft({ ...draft, ...patch });
  const setSource = (i: number, patch: Partial<NoteDraft['sources'][number]>) =>
    set({ sources: draft.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const gone = draft.id !== null && !current;
  const changed = !!current && current.editedAt !== draft.base;

  const done = () => {
    const checked = checkDraft(draft, notes);
    if (!checked.ok) return setError({ text: checked.error, ...(checked.other ? { other: checked.other } : {}) });
    try {
      if (current) {
        updateNote(doc, current.id, checked.note);
        onSaved(current.id);
      } else {
        // No other note has this topic (checked above, in this same turn of
        // the event loop), so saveNote creates one.
        const { note } = saveNote(doc, { ...checked.note, by: 'user' });
        onSaved(note.id);
      }
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : 'The note could not be saved.' });
    }
  };

  return (
    <div className="note-edit">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0 }}>{draft.id ? 'Edit note' : 'New note'}</h4>
        <span className="row">
          <button className="tb sm primary" onClick={done}>
            Done
          </button>
          <button className="tb sm line" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </span>
      </div>
      {gone && (
        <p className="warn-line" role="alert">
          This note was deleted in another tab. Done saves your text as a new note.
        </p>
      )}
      {changed && (
        <p className="warn-line" role="alert">
          This note changed elsewhere since you began; Done replaces it with your text.
        </p>
      )}
      <div className="field">
        <label htmlFor="note-topic">Topic</label>
        <input id="note-topic" autoFocus value={draft.topic} onChange={(e) => set({ topic: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="note-summary">Summary</label>
        <textarea id="note-summary" rows={5} value={draft.summary} onChange={(e) => set({ summary: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="note-facts">Facts for the table</label>
        <textarea
          id="note-facts"
          rows={4}
          placeholder="One fact per line"
          value={draft.facts}
          onChange={(e) => set({ facts: e.target.value })}
        />
      </div>
      <div className="field">
        <span className="label">Sources</span>
        {draft.sources.map((s, i) => (
          <div className="src-edit" key={i}>
            <input
              aria-label="Source title"
              placeholder="Title"
              value={s.title}
              onChange={(e) => setSource(i, { title: e.target.value })}
            />
            <input
              aria-label="Source address"
              placeholder="https://…"
              inputMode="url"
              value={s.url}
              onChange={(e) => setSource(i, { url: e.target.value })}
            />
            <input
              aria-label="Accessed"
              type="date"
              value={s.accessed}
              onChange={(e) => setSource(i, { accessed: e.target.value })}
            />
            <button
              className="tb sm"
              aria-label="Remove this source"
              title="Remove this source"
              onClick={() => set({ sources: draft.sources.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        <div>
          <button
            className="tb sm line"
            onClick={() => set({ sources: [...draft.sources, { title: '', url: '', accessed: today() }] })}
          >
            <PlusIcon />
            Add a source
          </button>
        </div>
      </div>
      {error && (
        <p className="err" role="alert">
          {error.text}{' '}
          {error.other && (
            <button className="link" onClick={() => onOpen(error.other!.id)}>
              Open it
            </button>
          )}
        </p>
      )}
    </div>
  );
}
