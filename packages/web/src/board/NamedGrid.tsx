import type { NamedCategory } from 'promptbook-project';
import { HandoutIcon, PeopleIcon, PersonIcon, PlusIcon } from '../ui/icons.js';
import { held, useBoardContext } from './context.js';
import { PromptBody, RemovePrompt } from './ImagePrompt.js';
import { Counts, StatusChip, SummaryLine } from './parts.js';
import { AddPromptEditor } from './PromptEditor.js';
import {
  cardFilterCounts,
  categoryText,
  filterLabels,
  keepsCard,
  newName,
  tally,
  type Filter,
} from './summary.js';

const icons: Record<NamedCategory, typeof PersonIcon> = { pc: PersonIcon, npc: PeopleIcon, handout: HandoutIcon };

// The summary line of the PCs, NPCs or Handouts tab: «4 PCs · 1 chosen, 1
// received, 2 wanted», and the filters; none for an empty tab.
export function NamedSummary({
  category,
  filter,
  setFilter,
}: {
  category: NamedCategory;
  filter: Filter;
  setFilter(filter: Filter): void;
}) {
  const { named, adding } = useBoardContext();
  const items = named[category];
  if (items.length === 0 && adding?.category !== category) return null;
  return (
    <SummaryLine counts={cardFilterCounts(items)} filter={filter} setFilter={setFilter} label="Filter the cards">
      <b>{items.length}</b> {categoryText[category].tab}
      <span className="sep">·</span>
      <Counts counts={tally(items.map((p) => p.status))} />
    </SummaryLine>
  );
}

// The PCs, NPCs or Handouts tab (screens 1b to 1d, 7b): one card per prompt
// and the add card, or the tab's empty state.
export function NamedGrid({
  category,
  title,
  filter,
  setFilter,
}: {
  category: NamedCategory;
  title: string;
  filter: Filter;
  setFilter(filter: Filter): void;
}) {
  const { doc, named, shown, toast, editing, adding, setAdding } = useBoardContext();
  const text = categoryText[category];
  const items = named[category];
  const addingHere = adding?.category === category;
  const add = () => setAdding({ category });

  if (items.length === 0 && !addingHere) {
    const Icon = icons[category];
    return (
      <div className="card emptyst catempty">
        <div className="big-ic">
          <Icon className="ic" />
        </div>
        <h2>{text.empty}</h2>
        <p>{text.what}</p>
        <div className="row">
          <button className="tb primary" onClick={add}>
            <PlusIcon />
            {text.add}
          </button>
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Claude can write them too, from the document: ask for "the {text.tab} of «{title}»".
        </p>
      </div>
    );
  }

  const kept = items.filter((p) => keepsCard(p, filter) || held(editing, p.prompt.id));
  return (
    <>
      <div className="ents">
        {kept.map((p) => {
          const prompt = shown.get(p.prompt.id) ?? { row: p, scene: null };
          return (
            <article className="card ent" key={p.prompt.id} id={`p-${p.prompt.id}`} data-status={p.status}>
              <div className="eh">
                <span className={`enm${p.prompt.name ? '' : ' new'}`}>{p.prompt.name || newName(category)}</span>
                <StatusChip status={p.status} />
                <RemovePrompt prompt={prompt} />
              </div>
              <div className="eb">
                <PromptBody prompt={prompt} />
              </div>
            </article>
          );
        })}
        {addingHere ? (
          <article className="card ent">
            <div className="eh">
              <span className="enm new">New {text.one}</span>
            </div>
            <div className="eb">
              <AddPromptEditor doc={doc} adding={{ category }} onToast={toast} onDone={() => setAdding(null)} />
            </div>
          </article>
        ) : (
          <button className="addcard" onClick={add}>
            <PlusIcon />
            {text.add}
          </button>
        )}
      </div>
      {kept.length === 0 && filter !== 'all' && (
        <p className="none">
          No {text.tab} are {filterLabels[filter].toLowerCase()}.{' '}
          <button className="lnk" onClick={() => setFilter('all')}>
            Show all
          </button>
        </p>
      )}
      <p className="hint" style={{ marginTop: 14 }}>
        {text.tab} belong to the whole adventure, not to a scene.
      </p>
    </>
  );
}
