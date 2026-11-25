import type { NamedCategory, PromptRow } from 'promptbook-project';
import { GeneralIcon, HandoutIcon, PeopleIcon, PersonIcon, PlusIcon } from '../ui/icons.js';
import { held, useBoardContext } from './context.js';
import { GeneratedHere } from './GeneratePanel.js';
import { PromptBody, RemovePrompt } from './ImagePrompt.js';
import { Counts, StatusChip, SummaryLine } from './parts.js';
import { AddPromptEditor } from './PromptEditor.js';
import {
  cardFilterCounts,
  categoryText,
  filterLabels,
  keepsCard,
  namedText,
  newName,
  tally,
  type Filter,
} from './summary.js';

export const icons: Record<NamedCategory, typeof PersonIcon> = {
  general: GeneralIcon,
  pc: PersonIcon,
  npc: PeopleIcon,
  handout: HandoutIcon,
};

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
    <SummaryLine
      counts={cardFilterCounts(items)}
      filter={filter}
      setFilter={setFilter}
      label="Filter the cards"
      end={<GeneratedHere />}
    >
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
  const { whole, named, editing, adding, setAdding, generation } = useBoardContext();
  const text = namedText(category, whole, generation.wording);
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
        {kept.map((p) => (
          <NamedCard key={p.prompt.id} row={p} />
        ))}
        {addingHere ? (
          <AddNamedCard category={category} onDone={() => setAdding(null)} />
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
        {text.tab} belong to the whole {whole}, not to a scene.
      </p>
    </>
  );
}

// A General image's, a PC's, an NPC's or a handout's card.
export function NamedCard({ row }: { row: PromptRow }) {
  const { shown } = useBoardContext();
  const prompt = shown.get(row.prompt.id) ?? { row, scene: null };
  const category = row.prompt.category as NamedCategory;
  return (
    <article className="card ent" id={`p-${row.prompt.id}`} data-status={row.status}>
      <div className="eh">
        <span className={`enm${row.prompt.name ? '' : ' new'}`}>{row.prompt.name || newName(category)}</span>
        <StatusChip status={row.status} />
        <RemovePrompt prompt={prompt} />
      </div>
      <div className="eb">
        <PromptBody prompt={prompt} />
      </div>
    </article>
  );
}

// The card of a new General image, PC, NPC or handout: «New NPC», «New
// image».
export function AddNamedCard({ category, onDone }: { category: NamedCategory; onDone(): void }) {
  const { doc, toast } = useBoardContext();
  return (
    <article className="card ent">
      <div className="eh">
        <span className="enm new">{newName(category)}</span>
      </div>
      <div className="eb">
        <AddPromptEditor doc={doc} adding={{ category }} onToast={toast} onDone={onDone} />
      </div>
    </article>
  );
}
