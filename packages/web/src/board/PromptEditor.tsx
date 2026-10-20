import { useRef, useState, type KeyboardEvent } from 'react';
import { LIMITS, setImagePrompt, setMusicPrompt, type ImagePrompt, type MusicPrompt } from 'promptbook-project';
import type * as Y from 'yjs';

// Screen 7: a prompt edited in place. Save overwrites it as the user's, dated
// now; prompts are not versioned (asset-board design decision 8). An empty
// prompt or title keeps the previous text: clearing is not offered.
//
// The draft is the editor's own: a prompt Claude or another tab writes
// meanwhile does not touch it, and the editor says so; Save then keeps the
// user's text.

export const LYRICS_TEMPLATE = '[Intro: low drone]\n[Instrumental]\n[Outro: fade out]\n[End]';

const CHANGED = 'This prompt changed while you were editing. Save replaces it with yours.';

function keys(save: () => void, cancel: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancel();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
  };
}

export function ImagePromptEditor({
  doc,
  sceneId,
  current,
  onDone,
}: {
  doc: Y.Doc;
  sceneId: string;
  current: ImagePrompt | null;
  onDone(saved: boolean): void;
}) {
  const base = useRef(current);
  const [draft, setDraft] = useState(current?.prompt ?? '');
  const changed = (base.current?.at ?? null) !== (current?.at ?? null);

  const save = () => {
    const prompt = draft.trim();
    if (prompt) setImagePrompt(doc, sceneId, prompt.slice(0, LIMITS.imagePrompt), 'user');
    onDone(prompt !== '');
  };
  const cancel = () => onDone(false);

  return (
    <div className="editbox" onKeyDown={keys(save, cancel)}>
      <textarea
        aria-label={`Midjourney prompt for ${sceneId}`}
        autoFocus
        maxLength={LIMITS.imagePrompt}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
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
