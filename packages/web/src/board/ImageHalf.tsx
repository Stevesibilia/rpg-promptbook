import type { BoardRow } from 'promptbook-project';
import { ImageIcon, PlusIcon } from '../ui/icons.js';
import { held, useBoardContext } from './context.js';
import { ImagePrompt } from './ImagePrompt.js';
import { SourceLine } from './parts.js';
import { AddPromptEditor } from './PromptEditor.js';
import { dims, stackLine, type Filter } from './summary.js';

// The Images · Midjourney half of a row (screen 1): the scene's visual: line,
// then a stack of image prompts and «Add image prompt». With a filter, the
// blocks not in its state dim; a half with none in it dims whole.
export function ImageHalf({ row, filter }: { row: BoardRow; filter: Filter }) {
  const { doc, projectId, shown, toast, editing, adding, setAdding } = useBoardContext();
  const addingHere = adding?.category === 'scene' && adding.sceneId === row.sceneId;
  const kept = (p: BoardRow['prompts'][number]) => !dims(p.status, filter) || held(editing, p.prompt.id);
  const dimAll = filter !== 'all' && !addingHere && !row.prompts.some(kept);
  const add = () => setAdding({ category: 'scene', sceneId: row.sceneId });

  return (
    <div className={`half${dimAll ? ' dim' : ''}`}>
      <div className="hh">
        <span className="lab">
          <ImageIcon className="ic" />
          Images · Midjourney
        </span>
        <span className="hsum">{stackLine(row.prompts)}</span>
      </div>
      <SourceLine label="visual" text={row.visual} projectId={projectId} sceneId={row.sceneId} />
      {row.prompts.length > 0 || addingHere ? (
        <>
          <div className="stack">
            {row.prompts.map((p) => {
              const prompt = shown.get(p.prompt.id) ?? { row: p, scene: { sceneId: row.sceneId, title: row.title } };
              return <ImagePrompt key={p.prompt.id} prompt={prompt} dim={!dimAll && !kept(p)} />;
            })}
            {addingHere && (
              <div className="ip">
                <div className="iph">
                  <span className="num">New prompt</span>
                </div>
                <AddPromptEditor
                  doc={doc}
                  adding={adding}
                  number={row.prompts.length + 1}
                  onToast={toast}
                  onDone={() => setAdding(null)}
                />
              </div>
            )}
          </div>
          {!addingHere && (
            <button className="addp" onClick={add}>
              <PlusIcon />
              Add image prompt
            </button>
          )}
        </>
      ) : (
        <div className="noprompt">
          <span>No image prompts yet. Ask Claude, or write one.</span>
          <button className="tb sm line" onClick={add}>
            <PlusIcon />
            Add image prompt
          </button>
        </div>
      )}
    </div>
  );
}
