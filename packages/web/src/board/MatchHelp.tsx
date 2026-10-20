import { useEffect, useRef } from 'react';
import type { BoardRow } from 'promptbook-project';
import { promptLabel, sceneLabel, tabLabel, type Named, type ShownPrompt } from './summary.js';

// How matching works (screen 5b): the rules, with examples from the
// project's first scene prompt with a text, its first PC, NPC or handout with
// one, and its first music title. Esc or a click outside closes it; the
// buttons that open it toggle it themselves.

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

export function MatchHelp({
  rows,
  named,
  shown,
  onClose,
}: {
  rows: readonly BoardRow[];
  named: Named;
  shown: ReadonlyMap<string, ShownPrompt>;
  onClose(): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const withText = (p: { prompt: { id: string; prompt: string } }) => p.prompt.prompt.trim() !== '';
  const firstScene = rows.flatMap((r) => r.prompts).find(withText);
  const firstNamed = [...named.pc, ...named.npc, ...named.handout].find(withText);
  const scene = firstScene && shown.get(firstScene.prompt.id);
  const person = firstNamed && shown.get(firstNamed.prompt.id);
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
    <div className="pop" ref={box} role="dialog" aria-label="How files find their prompt">
      <h4>
        How files find their prompt
        <button className="tb xs" title="Close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </h4>
      <div className="m">
        <b>Midjourney</b>
        <div>
          <p>
            The filename holds the first words of the prompt. They pick the prompt, in any category: Scenes, PCs,
            NPCs or Handouts.
          </p>
          {scene && (
            <>
              <div className="fn">
                you_<u>{midjourneyWords(scene.row.prompt.prompt)}</u>_3f9a1c22-…_2.png
              </div>
              <div className="arrow">→ Scenes · {promptLabel(scene)}</div>
            </>
          )}
          {person && (
            <>
              <div className="fn">
                you_<u>{midjourneyWords(person.row.prompt.prompt)}</u>_c41d07e2-…_0.png
              </div>
              <div className="arrow">→ {tabLabel(person)}</div>
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
        <b>Two matches</b>
        <div>
          <p>
            When two prompts start with the same words, their files match both. They wait in Unmatched, marked
            "matches 2 prompts": pick the prompt there. Start each prompt differently to avoid it.
          </p>
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
