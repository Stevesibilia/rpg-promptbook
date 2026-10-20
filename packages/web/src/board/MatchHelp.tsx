import { useEffect, useRef } from 'react';
import type { BoardRow } from 'promptbook-project';
import { sceneLabel } from './summary.js';

// How matching works (screen 5b): the rules, with examples from the
// project's first row with a prompt, and with a title. Esc or a click outside
// closes it; the buttons that open it toggle it themselves.

// The first words of a prompt as Midjourney writes them in a name: no
// apostrophes, the rest of the punctuation and spaces as underscores.
export function midjourneyWords(prompt: string, count = 6): string {
  return prompt
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, count)
    .join('_');
}

export function MatchHelp({ rows, onClose }: { rows: BoardRow[]; onClose(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const image = rows.find((r) => r.image?.prompt);
  const music = rows.find((r) => r.music?.title);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const outside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (box.current?.contains(target) || target.closest?.('[data-help-toggle]')) return;
      onClose();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('mousedown', outside);
    };
  }, [onClose]);

  return (
    <div className="pop" ref={box} role="dialog" aria-label="How files find their scene">
      <h4>
        How files find their scene
        <button className="tb xs" title="Close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </h4>
      <div className="m">
        <b>Midjourney</b>
        <div>
          <p>The filename holds the first words of the prompt. They pick the scene.</p>
          {image?.image && (
            <>
              <div className="fn">
                you_<u>{midjourneyWords(image.image.prompt)}</u>_3f9a1c22-…_2.png
              </div>
              <div className="arrow">→ {sceneLabel(image)}</div>
            </>
          )}
        </div>
      </div>
      <div className="m">
        <b>Suno</b>
        <div>
          <p>The filename is the track title from the prompt. A second take gets "(1)".</p>
          {music?.music && (
            <>
              <div className="fn">
                <u>{music.music.title.toLowerCase()}</u> (1).mp3
              </div>
              <div className="arrow">→ {sceneLabel(music)}</div>
            </>
          )}
        </div>
      </div>
      <div className="m">
        <b>Other files</b>
        <div>
          <p>Renamed files, or prompts you changed in Midjourney or Suno, go to Unmatched. Assign them by hand.</p>
        </div>
      </div>
    </div>
  );
}
