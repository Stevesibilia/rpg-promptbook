import { useState } from 'react';
import {
  addInspirationItem,
  addSeedVersion,
  isWebUrl,
  readInspiration,
  removeInspirationItem,
  seedVersions,
  type InspirationItem,
  type InspirationKind,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { dateAndTime, longDate } from '../dates.js';
import { useDocValue } from '../sync/hooks.js';
import { Confirm } from '../ui/Confirm.js';
import { InfoIcon, PlusIcon } from '../ui/icons.js';
import { Markdown } from '../ui/Markdown.js';
import { useToast } from '../ui/Toast.js';
import { hostOf } from './links.js';

export const kindLabels: Record<InspirationKind, string> = {
  link: 'Link',
  quote: 'Quote',
  image: 'Image link',
  note: 'Note',
};
const kinds: InspirationKind[] = ['link', 'quote', 'image', 'note'];

// The Inspiration view (connector specs, inspiration): the seed with its
// dated versions, then the sources of inspiration with the add row.
export function InspirationView({ doc }: { doc: Y.Doc }) {
  const [toast, showToast] = useToast();
  return (
    <div className="pane narrow-pane">
      <div className="head">
        <h1>Inspiration</h1>
        <p className="lead">The spark this project started from. Prep only: never printed.</p>
      </div>
      <SeedCard doc={doc} onSaved={() => showToast('Saved. The previous text is kept in Versions.')} />
      <Sources doc={doc} />
      {toast}
    </div>
  );
}

function SeedCard({ doc, onSaved }: { doc: Y.Doc; onSaved(): void }) {
  const versions = useDocValue(doc, seedVersions);
  const current = versions.at(-1)?.text ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [listOpen, setListOpen] = useState(false);
  // The version shown read-only, by its index.
  const [viewing, setViewing] = useState<number | null>(null);
  const shown = viewing === null ? null : versions[viewing];

  const save = () => {
    // A seed saved meanwhile in another tab stays as a version of its own.
    if (draft.trim() && draft !== current) {
      addSeedVersion(doc, draft);
      onSaved();
    }
    setEditing(false);
  };

  return (
    <div className="card">
      <div className="panel-h">
        Seed
        <span className="row">
          {!editing && (
            <button
              className="tb sm line"
              onClick={() => {
                setDraft(current);
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
          {versions.length > 0 && (
            <button className="tb sm line" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
              Versions ({versions.length}) ▾
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <div className="seedbox">
          <textarea
            aria-label="Seed"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
            }}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="tb primary sm" onClick={save}>
              Save as a new version
            </button>
            <button className="tb sm line" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <span className="hint" style={{ margin: 0 }}>
              Markdown. The old text stays in Versions.
            </span>
          </div>
        </div>
      ) : current ? (
        <div className="seedbox">
          <Markdown text={current} />
        </div>
      ) : (
        <p className="empty-line">No seed yet. Press Edit to write the first idea.</p>
      )}
      {listOpen && (
        <ul className="vers">
          {versions
            .map((v, i) => ({ v, i }))
            .reverse()
            .map(({ v, i }) => (
              <li key={i}>
                <span className="d">{dateAndTime(v.at, ', ')}</span>
                {i === versions.length - 1 && <span className="tag cur">current</span>}
                {i === 0 && <span className="tag">first idea</span>}
                <button className="link" onClick={() => setViewing(i)}>
                  View
                </button>
              </li>
            ))}
        </ul>
      )}
      {shown && (
        <div className="ro">
          <div className="panel-h">
            <span>Version of {dateAndTime(shown.at, ', ')} · read-only</span>
            <button className="tb sm" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
          <div className="seedbox">
            {shown.text ? <Markdown text={shown.text} /> : <p className="empty-line">Empty.</p>}
          </div>
        </div>
      )}
      <div className="hint">
        <InfoIcon className="ic info-ic" /> Claude can read the seed but never rewrites it.
      </div>
    </div>
  );
}

function Sources({ doc }: { doc: Y.Doc }) {
  const items = useDocValue(doc, readInspiration);
  const [kind, setKind] = useState<InspirationKind>('link');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [why, setWhy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<InspirationItem | null>(null);
  const linked = kind === 'link' || kind === 'image';

  const add = () => {
    const title = text.trim();
    const address = url.trim();
    if (linked && !isWebUrl(address)) return setError('A link needs an http or https address.');
    if (!linked && !title) return setError('Write the text first.');
    try {
      addInspirationItem(doc, {
        kind,
        text: linked ? title || address : title,
        ...(linked ? { url: address } : {}),
        why: why.trim(),
        by: 'user',
      });
    } catch (e) {
      return setError(e instanceof Error ? e.message : 'The item could not be added.');
    }
    setText('');
    setUrl('');
    setWhy('');
    setError(null);
  };

  return (
    <div className="card">
      <div className="panel-h">
        Sources of inspiration{' '}
        <span className="cnt">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      <div className="items">
        {items.length === 0 && <p className="empty-line">No sources yet.</p>}
        {items.map((item) => (
          <Item key={item.id} item={item} onDelete={() => setRemoving(item)} />
        ))}
      </div>
      <div className="addform">
        <select
          aria-label="Kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as InspirationKind);
            setError(null);
          }}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {kindLabels[k]}
            </option>
          ))}
        </select>
        <input
          aria-label={linked ? 'Title' : 'Text'}
          placeholder={linked ? 'Title (optional)' : kind === 'quote' ? 'The quote' : 'The note'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        {linked && (
          <input
            className="full-w"
            aria-label="Address"
            placeholder="Address, https://…"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        )}
        <input
          className="full-w"
          aria-label="Why it matters"
          placeholder="Why it matters"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <div className="full-w row">
          <button className="tb primary sm" onClick={add}>
            <PlusIcon />
            Add item
          </button>
          {error ? (
            <span className="err inline-err" role="alert">
              {error}
            </span>
          ) : (
            <span className="hint" style={{ margin: 0 }}>
              Claude adds items the same way during a chat.
            </span>
          )}
        </div>
      </div>
      {removing && (
        <Confirm
          title="Delete this item?"
          action="Delete"
          danger
          note="The prep document is not touched."
          onConfirm={() => removeInspirationItem(doc, removing.id)}
          onClose={() => setRemoving(null)}
        >
          «{removing.text}» leaves the sources of inspiration.
        </Confirm>
      )}
    </div>
  );
}

function Item({ item, onDelete }: { item: InspirationItem; onDelete(): void }) {
  // Readers drop addresses that are not http or https; checked again here,
  // since only such an address may become a link.
  const url = (item.kind === 'link' || item.kind === 'image') && isWebUrl(item.url) ? item.url : '';
  return (
    <div className="item">
      <span className={`kind ${item.kind}`}>{kindLabels[item.kind]}</span>
      <div>
        <div className={`tx${item.kind === 'quote' ? ' q' : ''}`}>
          {url ? (
            <>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {item.text}
              </a>{' '}
              <span className="dom">{hostOf(url)}</span>
            </>
          ) : (
            item.text
          )}
        </div>
        {item.why && (
          <div className="why">
            <b>Why it matters:</b> {item.why}
          </div>
        )}
      </div>
      <div className="by">
        <span>
          {item.by === 'claude' ? <span className="who-cl">Claude</span> : 'You'} · {longDate(item.at)}
        </span>
        <button className="tb sm danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
