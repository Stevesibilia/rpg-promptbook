import { useEffect, useRef } from 'react';
import type { BoardRow, MusicCardRow } from 'promptbook-project';
import { musicLabel, promptLabel, sceneLabel, tabLabel, type Named, type ShownPrompt, type Whole } from './summary.js';

// How matching works (screen 5b): the rules, with examples from the
// project's first scene prompt with a text, its first General image, PC,
// NPC or handout with one, its first scene music title and its first General
// music prompt. Esc or a click outside closes it; the
// buttons that open it toggle it themselves. A campaign's rules name no
// scene (campaign-board design decision 4).

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
  music,
  shown,
  whole,
  onClose,
}: {
  rows: readonly BoardRow[];
  named: Named;
  music: readonly MusicCardRow[];
  shown: ReadonlyMap<string, ShownPrompt>;
  whole: Whole;
  onClose(): void;
}) {
  const campaign = whole === 'campaign';
  const box = useRef<HTMLDivElement>(null);
  const withText = (p: { prompt: { id: string; prompt: string } }) => p.prompt.prompt.trim() !== '';
  const firstScene = campaign ? undefined : rows.flatMap((r) => r.prompts).find(withText);
  const firstNamed = [...named.general, ...named.pc, ...named.npc, ...named.handout].find(withText);
  const scene = firstScene && shown.get(firstScene.prompt.id);
  const person = firstNamed && shown.get(firstNamed.prompt.id);
  const sceneMusic = campaign ? undefined : rows.find((r) => r.music?.title);
  const general = music[0];

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
            The filename holds the first words of the prompt. They pick the prompt, in any category:{' '}
            {campaign ? 'General, PCs, NPCs or Handouts.' : 'Scenes, General, PCs, NPCs or Handouts.'}
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
          <p>
            {campaign
              ? 'The filename is the track title of a General music prompt.'
              : 'The filename is the track title from the prompt, of a scene or of a General music prompt.'}{' '}
            A second take gets "(1)".
          </p>
          {sceneMusic?.music && (
            <>
              <div className="fn">
                <u>{sceneMusic.music.title.toLowerCase()}</u> (1).mp3
              </div>
              <div className="arrow">→ {sceneLabel(sceneMusic)}</div>
            </>
          )}
          {general && (
            <>
              <div className="fn">
                <u>{general.prompt.title.toLowerCase()}</u>.mp3
              </div>
              <div className="arrow">→ {musicLabel(general)}</div>
            </>
          )}
        </div>
      </div>
      <div className="m">
        <b>Two matches</b>
        <div>
          <p>
            When two prompts start with the same words, their files match both. They wait in Unmatched, marked
            "matches 2 prompts": pick the prompt there. Start each prompt differently to avoid it. A track title used
            twice{campaign ? '' : ', in scenes or General,'} warns on both and its tracks wait in Unmatched.
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
