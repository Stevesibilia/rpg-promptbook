import type { BoardRow, PromptRow } from 'promptbook-project';
import { categoryOf, categoryText, tabLine, tabs, type Named, type Tab } from './summary.js';

// The category switch (image-categories design decision 7): Scenes, PCs,
// NPCs and Handouts, each with its number of image prompts, what is still
// wanted, and a dot while one of its prompts, or for Scenes a track, holds a
// file marked new.
export function CategoryTabs({
  tab,
  onTab,
  rows,
  named,
  marks,
}: {
  tab: Tab;
  onTab(tab: Tab): void;
  rows: readonly BoardRow[];
  named: Named;
  marks: ReadonlySet<string>;
}) {
  const marked = (prompts: readonly PromptRow[]) => prompts.some((p) => p.images.some((f) => marks.has(f.id)));
  return (
    <div className="cats" role="tablist" aria-label="Image categories">
      {tabs.map((t) => {
        const category = categoryOf[t];
        const prompts = category === 'scene' ? rows.flatMap((r) => r.prompts) : named[category];
        const fresh =
          marks.size > 0 &&
          (marked(prompts) || (category === 'scene' && rows.some((r) => r.tracks.some((f) => marks.has(f.id)))));
        const { line, title, wanted } = tabLine(prompts);
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
              <span className="n">{prompts.length}</span>
              {fresh && <i className="nd" title="New files" />}
            </span>
            <span className={`cs${wanted ? ' w' : ''}`}>{line}</span>
          </button>
        );
      })}
    </div>
  );
}
