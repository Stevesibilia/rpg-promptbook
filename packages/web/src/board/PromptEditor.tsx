import { useRef, useState, type KeyboardEvent } from 'react';
import { LIMITS, setMusicPrompt, type MusicPrompt, type NamedCategory } from 'promptbook-project';
import type * as Y from 'yjs';
import { addPrompt, EMPTY_PROMPT, savePrompt } from './actions.js';
import type { Adding } from './context.js';
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
// «New prompt» block holds the text area; a PC's, an NPC's or a handout's
// card holds Name, focused, and Prompt.
export function AddPromptEditor({
  doc,
  adding,
  number = 1,
  onToast,
  onDone,
}: {
  doc: Y.Doc;
  adding: Adding;
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
          : `Midjourney prompt for the new ${categoryText[adding.category].one}`
      }
      autoFocus={!named}
      maxLength={LIMITS.imagePrompt}
      placeholder={adding.category === 'scene' ? `A Midjourney prompt for ${adding.sceneId}…` : 'portrait of …'}
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

export function MusicPromptEditor({
  doc,
  sceneId,
  current,
  onDone,
}: {
  doc: Y.Doc;
  sceneId: string;
  current: MusicPrompt | null;
  onDone(saved: boolean): void;
}) {
  const base = useRef(current);
  const [title, setTitle] = useState(current?.title ?? '');
  const [style, setStyle] = useState(current?.style ?? '');
  const [lyrics, setLyrics] = useState(current ? current.lyrics : LYRICS_TEMPLATE);
  const changed = (base.current?.at ?? null) !== (current?.at ?? null);
  const id = (part: string) => `ed-${sceneId}-${part}`;

  const titleInput = useRef<HTMLInputElement>(null);
  // A track needs its title, which names the download and matches it: with
  // none typed and none before, Save waits for one.
  const save = () => {
    const next = {
      title: (title.trim() || current?.title || '').slice(0, LIMITS.trackTitle),
      style: style.trim().slice(0, LIMITS.style),
      lyrics: lyrics.slice(0, LIMITS.lyrics),
    };
    if (!next.title) {
      titleInput.current?.focus();
      return;
    }
    setMusicPrompt(doc, sceneId, next, 'user');
    onDone(true);
  };
  const cancel = () => onDone(false);

  return (
    <div className="editbox" onKeyDown={keys(save, cancel)}>
      <div className="eg">
        <label htmlFor={id('t')}>Title</label>
        <input
          id={id('t')}
          ref={titleInput}
          autoFocus
          maxLength={LIMITS.trackTitle}
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
