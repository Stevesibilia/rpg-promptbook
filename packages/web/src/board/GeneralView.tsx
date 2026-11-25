import { GeneralIcon, ImageIcon, MusicIcon, PlusIcon } from '../ui/icons.js';
import { held, useBoardContext } from './context.js';
import { GeneratedHere } from './GeneratePanel.js';
import { AddMusicCard, MusicCard } from './MusicCard.js';
import { AddNamedCard, NamedCard } from './NamedGrid.js';
import { Counts, SummaryLine } from './parts.js';
import { filterLabels, keepsCard, namedText, sectionLine, summarizeGeneral, type Filter } from './summary.js';

// The General tab (general-board-items design decision 9, screens 1a and
// 7c): the General images, then the General music prompts, each section
// with its cards and its add card; or, with neither, what General is for.

// A General music prompt held on the board whatever the filter: its editor,
// its remove confirm or a track's confirm is open.
const heldMusic = (editing: ReadonlySet<string>, id: string) =>
  ['music', 'remove', 'track'].some((part) => editing.has(`music:${id}/${part}`));

// «3 images: 1 chosen, 1 received, 1 wanted · 3 music: 1 chosen, 1
// received, 1 wanted», and the filters, which count both; none for an empty
// tab.
export function GeneralSummary({ filter, setFilter }: { filter: Filter; setFilter(filter: Filter): void }) {
  const { named, music, adding } = useBoardContext();
  const images = named.general;
  if (images.length === 0 && music.length === 0 && adding?.category !== 'general' && adding?.category !== 'music') {
    return null;
  }
  const sum = summarizeGeneral(images, music);
  return (
    <SummaryLine counts={sum.filters} filter={filter} setFilter={setFilter} label="Filter the cards" end={<GeneratedHere />}>
      <b>{sum.images}</b> {sum.images === 1 ? 'image' : 'images'}: <Counts counts={sum.imageCounts} />
      <span className="sep">·</span>
      <b>{sum.music}</b> music: <Counts counts={sum.musicCounts} />
    </SummaryLine>
  );
}

export function GeneralView({
  title,
  filter,
  setFilter,
}: {
  title: string;
  filter: Filter;
  setFilter(filter: Filter): void;
}) {
  const { whole, named, music, editing, adding, setAdding } = useBoardContext();
  const text = namedText('general', whole);
  const images = named.general;
  const addingImage = adding?.category === 'general';
  const addingMusic = adding?.category === 'music';
  const addImage = () => setAdding({ category: 'general' });
  const addMusic = () => setAdding({ category: 'music' });

  if (images.length === 0 && music.length === 0 && !addingImage && !addingMusic) {
    return (
      <div className="card emptyst catempty">
        <div className="big-ic">
          <GeneralIcon className="ic" />
        </div>
        <h2>{text.empty}</h2>
        <p>{text.what}</p>
        <div className="row">
          <button className="tb primary" onClick={addImage}>
            <PlusIcon />
            Add image
          </button>
          <button className="tb line" onClick={addMusic}>
            <PlusIcon />
            Add music prompt
          </button>
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Claude can write them too: ask for "the general images and music of «{title}»".
        </p>
      </div>
    );
  }

  const keptImages = images.filter((p) => keepsCard(p, filter) || held(editing, p.prompt.id));
  const keptMusic = music.filter((m) => keepsCard(m, filter) || heldMusic(editing, m.prompt.id));
  const none = (what: string) => (
    <p className="none">
      No general {what} {filterLabels[filter].toLowerCase()}.{' '}
      <button className="lnk" onClick={() => setFilter('all')}>
        Show all
      </button>
    </p>
  );

  return (
    <>
      <section className="gsec" aria-label="General images">
        <div className="gsh">
          <span className="lab">
            <ImageIcon className="ic" />
            Images · Midjourney
          </span>
          <span className="hsum">{sectionLine(images, 'image', 'images')}</span>
        </div>
        <div className="ents">
          {keptImages.map((p) => (
            <NamedCard key={p.prompt.id} row={p} />
          ))}
          {addingImage ? (
            <AddNamedCard category="general" onDone={() => setAdding(null)} />
          ) : (
            <button className="addcard sm" onClick={addImage}>
              <PlusIcon />
              Add image
            </button>
          )}
        </div>
        {keptImages.length === 0 && filter !== 'all' && none('images are')}
      </section>
      <section className="gsec" aria-label="General music">
        <div className="gsh">
          <span className="lab">
            <MusicIcon className="ic" />
            Music · Suno
          </span>
          <span className="hsum">{sectionLine(music, 'music prompt', 'music prompts')}</span>
        </div>
        <div className="ents mus">
          {keptMusic.map((m) => (
            <MusicCard key={m.prompt.id} card={m} />
          ))}
          {addingMusic ? (
            <AddMusicCard onDone={() => setAdding(null)} />
          ) : (
            <button className="addcard sm" onClick={addMusic}>
              <PlusIcon />
              Add music prompt
            </button>
          )}
        </div>
        {keptMusic.length === 0 && filter !== 'all' && none('music is')}
      </section>
      <p className="hint" style={{ marginTop: 14 }}>
        General images and music belong to the whole {whole}, not to a scene. Their files find them by filename, like
        the others.
      </p>
    </>
  );
}
