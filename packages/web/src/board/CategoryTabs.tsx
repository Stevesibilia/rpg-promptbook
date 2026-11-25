import type { BoardRow, FileEntry, MusicCardRow, PromptRow } from 'promptbook-project';
import { categoryOf, categoryText, generalTabLine, tabLine, tabs, type Named, type Tab } from './summary.js';

// The category switch (image-categories design decision 7): Scenes,
// General, PCs, NPCs and Handouts, each with its number of prompts (on
// General, image and music prompts together), what is still wanted, and a
// dot while one of its prompts, or for Scenes and General a track, holds a
// file marked new.
export function CategoryTabs({
  tab,
  onTab,
  rows,
  named,
  music,
  marks,
}: {
  tab: Tab;
  onTab(tab: Tab): void;
  rows: readonly BoardRow[];
  named: Named;
  music: readonly MusicCardRow[];
  marks: ReadonlySet<string>;
}) {
  const marked = (files: readonly FileEntry[]) => files.some((f) => marks.has(f.id));
  const markedPrompts = (prompts: readonly PromptRow[]) => prompts.some((p) => marked(p.images));
  return (
    <div className="cats" role="tablist" aria-label="Image categories">
      {tabs.map((t) => {
        const category = categoryOf[t];
        const prompts = category === 'scene' ? rows.flatMap((r) => r.prompts) : named[category];
        const tracks =
          category === 'scene'
            ? rows.flatMap((r) => r.tracks)
            : category === 'general'
              ? music.flatMap((m) => m.tracks)
              : [];
        const fresh = marks.size > 0 && (markedPrompts(prompts) || marked(tracks));
        const { line, title, wanted, count } =
          category === 'general' ? generalTabLine(prompts, music) : { ...tabLine(prompts), count: prompts.length };
        return (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'on' : ''}
            title={title}
            onClick={() => onTab(t)}
          >
            <span className="cl">
              {categoryText[category].tab}
              <span className="n">{count}</span>
              {fresh && <i className="nd" title="New files" />}
            </span>
            <span className={`cs${wanted ? ' w' : ''}`}>{line}</span>
          </button>
        );
      })}
    </div>
  );
}
