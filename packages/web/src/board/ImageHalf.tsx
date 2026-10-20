import { useRef, useState } from 'react';
import type { BoardRow, FileEntry } from 'promptbook-project';
import { DropIcon, EditIcon, ImageIcon } from '../ui/icons.js';
import { toggleChoice } from './actions.js';
import { useBoardContext } from './context.js';
import { CopyButton } from './CopyButton.js';
import { FileImage, Provenance, SourceLine, StatusChip } from './parts.js';
import { ImagePromptEditor } from './PromptEditor.js';

// The Image · Midjourney half of a row (screen 1).
export function ImageHalf({ row, dim }: { row: BoardRow; dim: boolean }) {
  const { doc, projectId, toast } = useBoardContext();
  const [editing, setEditing] = useState(false);
  const text = useRef<HTMLDivElement>(null);
  const { image } = row;

  let prompt;
  if (editing) {
    prompt = (
      <ImagePromptEditor
        doc={doc}
        sceneId={row.sceneId}
        current={image}
        onDone={(saved) => {
          setEditing(false);
          if (saved) toast('Saved.');
        }}
      />
    );
  } else if (image) {
    prompt = (
      <div className="pbox">
        <div className="ptext" ref={text}>
          {image.prompt}
        </div>
        <div className="pfoot">
          <Provenance by={image.by} at={image.at} />
          <CopyButton text={image.prompt} source={text} onFallback={toast} />
          <button className="tb sm" onClick={() => setEditing(true)}>
            <EditIcon />
            Edit
          </button>
        </div>
      </div>
    );
  } else {
    prompt = (
      <div className="noprompt">
        <span>No Midjourney prompt yet. Ask Claude, or write one.</span>
        <button className="tb sm line" onClick={() => setEditing(true)}>
          <EditIcon />
          Write by hand
        </button>
      </div>
    );
  }

  return (
    <div className={`half${dim ? ' dim' : ''}`} data-half={row.imageStatus}>
      <div className="hh">
        <span className="lab">
          <ImageIcon className="ic" />
          Image · Midjourney
        </span>
        <StatusChip status={row.imageStatus} />
      </div>
      <SourceLine label="visual" text={row.visual} projectId={projectId} sceneId={row.sceneId} />
      {prompt}
      {row.images.length > 0 ? (
        <div className="thumbs">
          {row.images.map((file, i) => (
            <Thumb key={file.id} row={row} file={file} n={i + 1} />
          ))}
        </div>
      ) : image ? (
        <div className="empty-drop">
          <DropIcon className="ic" />
          <span>No images yet. Drop Midjourney's four files anywhere on the board.</span>
        </div>
      ) : (
        <div className="slots" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}

function Thumb({ row, file, n }: { row: BoardRow; file: FileEntry; n: number }) {
  const { doc, projectId, marks, openViewer } = useBoardContext();
  const chosen = row.chosenImage === file.id;
  const others = row.chosenImage !== null && !chosen;
  const open = () => openViewer(row.sceneId, file.id);
  return (
    <div
      className={`th-i${chosen ? ' chosen' : others ? ' others' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Open image ${n} of ${row.sceneId}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <FileImage projectId={projectId} file={file} />
      <button
        className="pick"
        title={chosen ? 'Chosen. Click to unchoose' : 'Choose this image'}
        aria-label={chosen ? 'Chosen. Click to unchoose' : 'Choose this image'}
        aria-pressed={chosen}
        onClick={(e) => {
          e.stopPropagation();
          toggleChoice(doc, row.sceneId, file);
        }}
      >
        {chosen ? '✓' : ''}
      </button>
      {marks.has(file.id) && <span className="badge new">new</span>}
      <span className="idx">{n}</span>
    </div>
  );
}
