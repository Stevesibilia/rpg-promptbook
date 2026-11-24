import { useRef, useState, type KeyboardEvent } from 'react';
import { LIMITS, type MusicInput, type MusicPrompt, type NamedCategory } from 'promptbook-project';
import type * as Y from 'yjs';
import { addPrompt, EMPTY_PROMPT, savePrompt } from './actions.js';
import type { ImageAdding } from './context.js';
import { categoryText, promptLabel, type ShownPrompt } from './summary.js';

// Screen 7: a prompt edited in place. Save overwrites it as the user's, dated
// now; prompts are not versioned (asset-board design decision 8). An empty
// image prompt is refused; an empty title keeps the previous one: clearing
// is not offered.
//
// The draft is the editor's own: a prompt Claude or another tab writes
// meanwhile does not touch it, and the editor says so; Save then keeps the
// user's text.

export const LYRICS_TEMPLATE = '[Intro: low drone]\n[Instrumental]\n[Outro: fade out]\n[End]';

const CHANGED = 'This prompt changed while you were editing. Save replaces it with yours.';

// A name is one line.
const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ');

function keys(save: () => void, cancel: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancel();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
  };
}

// A prompt's editor: the text area, with Name above it for a PC, an NPC or
// a handout. An empty prompt is refused with a toast and the editor stays.
export function ImagePromptEditor({
  doc,
  prompt,
  onToast,
  onDone,
}: {
  doc: Y.Doc;
  prompt: ShownPrompt;
  onToast(message: string): void;
  onDone(saved: boolean): void;
}) {
  const entry = prompt.row.prompt;
  const named = entry.category !== 'scene';
  const base = useRef(entry);
  const [draft, setDraft] = useState(entry.prompt);
  const [name, setName] = useState(entry.name ?? '');
  const text = useRef<HTMLTextAreaElement>(null);
  const changed = base.current.at !== entry.at || base.current.prompt !== entry.prompt || base.current.name !== entry.name;
  const id = (part: string) => `ed-${entry.id}-${part}`;

  const save = () => {
    const value = draft.trim();
    if (!value) {
      onToast(EMPTY_PROMPT);
      text.current?.focus();
      return;
    }
    const patch = { prompt: value.slice(0, LIMITS.imagePrompt), category: entry.category };
    const saved = savePrompt(doc, entry.id, named ? { ...patch, name: oneLine(name).trim().slice(0, LIMITS.name) } : patch);
    onDone(saved);
  };
  const cancel = () => onDone(false);
  const area = (
    <textarea
      id={id('p')}
      ref={text}
      aria-label={`Midjourney prompt for ${promptLabel(prompt)}`}
      autoFocus={!named || entry.name !== ''}
      maxLength={LIMITS.imagePrompt}
      placeholder={named ? 'portrait of …' : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );

  return (
    <div className="editbox" onKeyDown={keys(save, cancel)}>
      {named ? (
        <div className="eg">
          <label htmlFor={id('n')}>Name</label>
          <input
            id={id('n')}
            autoFocus={entry.name === ''}
            maxLength={LIMITS.name}
            placeholder={categoryText[entry.category as NamedCategory].example}
            value={name}
            onChange={(e) => setName(oneLine(e.target.value))}
          />
          <label htmlFor={id('p')}>Prompt</label>
          {area}
        </div>
      ) : (
        area
      )}
      {changed && <div className="changed">{CHANGED}</div>}
      <div className="pfoot">
        <span className="hint">Claude can rewrite it later.</span>
        <button className="tb sm line" onClick={cancel}>
          Cancel
        </button>
        <button className="tb sm primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

// The Add editor (screen 7b): nothing is written before Add. A scene's
// «New prompt» block holds the text area; a General image's, a PC's, an
// NPC's or a handout's card holds Name, focused, and Prompt.
export function AddPromptEditor({
  doc,
  adding,
  number = 1,
  onToast,
  onDone,
}: {
  doc: Y.Doc;
  adding: ImageAdding;
  // A scene prompt's number once added.
  number?: number;
  onToast(message: string): void;
  onDone(): void;
}) {
  const [draft, setDraft] = useState('');
  const [name, setName] = useState('');
  const text = useRef<HTMLTextAreaElement>(null);
  // Add once, however fast it is pressed again.
  const done = useRef(false);
  const named = adding.category !== 'scene';

  const add = () => {
    if (done.current) return;
    const value = draft.trim();
    if (!value) {
      onToast(EMPTY_PROMPT);
      text.current?.focus();
      return;
    }
    const prompt = value.slice(0, LIMITS.imagePrompt);
    const { added, said } =
      adding.category === 'scene'
        ? addPrompt(doc, adding, prompt)
        : addPrompt(doc, { category: adding.category, name: oneLine(name).trim().slice(0, LIMITS.name) }, prompt);
    onToast(said);
    // The project full: the draft stays.
    if (!added) return;
    done.current = true;
    onDone();
  };
  const cancel = () => onDone();
  const id = (part: string) => `add-${adding.category === 'scene' ? adding.sceneId : adding.category}-${part}`;
  const area = (
    <textarea
      id={id('p')}
      ref={text}
      aria-label={
        adding.category === 'scene'
          ? `Midjourney prompt for ${adding.sceneId} · prompt ${number}`
          : `Midjourney prompt for the new ${adding.category === 'general' ? 'General image' : categoryText[adding.category].one}`
      }
      autoFocus={!named}
      maxLength={LIMITS.imagePrompt}
      placeholder={
        adding.category === 'scene'
          ? `A Midjourney prompt for ${adding.sceneId}…`
          : adding.category === 'general'
            ? undefined
            : 'portrait of …'
      }
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );

  return (
    <div className="editbox" onKeyDown={keys(add, cancel)}>
      {adding.category !== 'scene' ? (
        <div className="eg">
          <label htmlFor={id('n')}>Name</label>
          <input
            id={id('n')}
            autoFocus
            maxLength={LIMITS.name}
            placeholder={categoryText[adding.category].example}
            value={name}
            onChange={(e) => setName(oneLine(e.target.value))}
          />
          <label htmlFor={id('p')}>Prompt</label>
          {area}
        </div>
      ) : (
        area
      )}
      <div className="pfoot">
        <span className="hint">Its first words are how its images find it.</span>
        <button className="tb sm line" onClick={cancel}>
          Cancel
        </button>
        <button className="tb sm primary" onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}

// A Suno prompt's editor: Title, Style and Lyrics, for a scene's music half
// or a General music prompt, new (Add) or not (Save). A scene's empty title
// keeps the one before and waits for one when there was none; a General
// prompt's empty title is refused with `onEmptyTitle`, its tracks' only way
// to find it (general-board-items design decision 9).
export function MusicPromptEditor({
  idPrefix,
  current,
  action = 'Save',
  titlePlaceholder,
  onEmptyTitle,
  onSave,
  onCancel,
}: {
  // The fields' ids: «ed-S3», «ed-music-<id>», «add-music».
  idPrefix: string;
  current: Pick<MusicPrompt, 'title' | 'style' | 'lyrics' | 'at'> | null;
  action?: 'Save' | 'Add';
  titlePlaceholder?: string;
  onEmptyTitle?(): void;
  onSave(next: MusicInput): void;
  onCancel(): void;
}) {
  const base = useRef(current);
  const [title, setTitle] = useState(current?.title ?? '');
  const [style, setStyle] = useState(current?.style ?? '');
  const [lyrics, setLyrics] = useState(current ? current.lyrics : LYRICS_TEMPLATE);
  const changed = (base.current?.at ?? null) !== (current?.at ?? null);
  const id = (part: string) => `${idPrefix}-${part}`;

  const titleInput = useRef<HTMLInputElement>(null);
  // A track needs its title, which names the download and matches it.
  const save = () => {
    const typed = title.trim();
    const next = {
      title: (onEmptyTitle ? typed : typed || current?.title || '').slice(0, LIMITS.trackTitle),
      style: style.trim().slice(0, LIMITS.style),
      lyrics: lyrics.slice(0, LIMITS.lyrics),
    };
    if (!next.title) {
      onEmptyTitle?.();
      titleInput.current?.focus();
      return;
    }
    onSave(next);
  };

  return (
    <div className="editbox" onKeyDown={keys(save, onCancel)}>
      <div className="eg">
        <label htmlFor={id('t')}>Title</label>
        <input
          id={id('t')}
          ref={titleInput}
          autoFocus
          maxLength={LIMITS.trackTitle}
          placeholder={titlePlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/[\r\n]/g, ' '))}
        />
        <label htmlFor={id('s')}>Style</label>
        <textarea id={id('s')} maxLength={LIMITS.style} value={style} onChange={(e) => setStyle(e.target.value)} />
        <label htmlFor={id('l')}>Lyrics</label>
        <textarea id={id('l')} maxLength={LIMITS.lyrics} value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
      </div>
      {changed && <div className="changed">{CHANGED}</div>}
      <div className="pfoot">
        <span className="hint">Suno names the download after the title.</span>
        <button className="tb sm line" onClick={onCancel}>
          Cancel
        </button>
        <button className="tb sm primary" onClick={save}>
          {action}
        </button>
      </div>
    </div>
  );
}
