import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FileEntry } from 'promptbook-project';
import { Confirm } from '../ui/Confirm.js';
import { DropIcon, EditIcon, LaptopIcon, TrashIcon } from '../ui/icons.js';
import { promptQuestion, removePrompt, toggleImage } from './actions.js';
import { useBoardContext } from './context.js';
import { CopyButton } from './CopyButton.js';
import { localTitle, useLocalFiles } from './device.js';
import { FileImage, Provenance, StatusChip } from './parts.js';
import { ImagePromptEditor } from './PromptEditor.js';
import { promptLabel, shapeOf, type ShownPrompt } from './summary.js';

// One image prompt of a scene's stack (screen 1): «Prompt 2», its status and
// Remove, then its text and images.
export function ImagePrompt({ prompt, dim }: { prompt: ShownPrompt; dim: boolean }) {
  return (
    <div className={`ip${dim ? ' dim' : ''}`} id={`p-${prompt.row.prompt.id}`} data-status={prompt.row.status}>
      <div className="iph">
        <span className="num">Prompt {prompt.row.number}</span>
        <StatusChip status={prompt.row.status} />
        <RemovePrompt prompt={prompt} />
      </div>
      <PromptBody prompt={prompt} />
    </div>
  );
}

// The trash button and its confirm: the prompt leaves the board, its images
// wait in Unmatched (O6).
export function RemovePrompt({ prompt }: { prompt: ShownPrompt }) {
  const { doc, toast, setEditing: hold } = useBoardContext();
  // Removed meanwhile (Claude, another tab), the block goes, its confirm too;
  // while it asks, a change of status does not filter it away.
  const id = prompt.row.prompt.id;
  const [confirm, setConfirmHere] = useState(false);
  const setConfirm = (on: boolean) => {
    setConfirmHere(on);
    hold(`${id}/remove`, on);
  };
  useEffect(() => () => hold(`${id}/remove`, false), [hold, id]);
  const question = promptQuestion(prompt);
  return (
    <>
      <button
        className="tb xs rm"
        title="Remove this prompt"
        aria-label={`Remove ${promptLabel(prompt)}`}
        onClick={() => setConfirm(true)}
      >
        <TrashIcon />
      </button>
      {/* Out of the block, which a filter may dim. */}
      {confirm &&
        createPortal(
          <Confirm
            title={question.title}
            note={question.note}
            action="Remove"
            danger
            onClose={() => setConfirm(false)}
            onConfirm={() => {
              const said = removePrompt(doc, id);
              if (said) toast(said);
            }}
          >
            {question.text}
          </Confirm>,
          document.body,
        )}
    </>
  );
}

// A prompt's text (or its editor) and its images, in a scene's block or on a
// PC's, an NPC's or a handout's card.
export function PromptBody({ prompt }: { prompt: ShownPrompt }) {
  const { doc, toast, setEditing: hold } = useBoardContext();
  const id = prompt.row.prompt.id;
  // The board keeps the prompt shown while its editor is open.
  const [editing, setEditingHere] = useState(false);
  const setEditing = (on: boolean) => {
    setEditingHere(on);
    hold(id, on);
  };
  useEffect(() => () => hold(id, false), [hold, id]);
  const text = useRef<HTMLDivElement>(null);
  const entry = prompt.row.prompt;
  const { images } = prompt.row;

  let box;
  if (editing) {
    box = (
      <ImagePromptEditor
        doc={doc}
        prompt={prompt}
        onToast={toast}
        onDone={(saved) => {
          setEditing(false);
          if (saved) toast('Saved.');
        }}
      />
    );
  } else if (entry.prompt) {
    box = (
      <div className="pbox">
        <div className="ptext" ref={text}>
          {entry.prompt}
        </div>
        <div className="pfoot">
          <Provenance by={entry.by} at={entry.at} />
          <CopyButton text={entry.prompt} source={text} onFallback={toast} />
          <button className="tb sm" onClick={() => setEditing(true)}>
            <EditIcon />
            Edit
          </button>
        </div>
      </div>
    );
  } else {
    // A migrated prompt with images and no text.
    box = (
      <div className="noprompt">
        <span>No Midjourney prompt yet. Ask Claude, or write one.</span>
        <button className="tb sm line" onClick={() => setEditing(true)}>
          <EditIcon />
          Write by hand
        </button>
      </div>
    );
  }

  const shapes = images.map(shapeOf);
  // Portraits keep four per line on a phone.
  const tall = shapes.length > 0 && shapes.every((s) => s.tall);
  return (
    <>
      {box}
      {images.length > 0 ? (
        <div className={`thumbs${tall ? ' tall' : ''}`}>
          {images.map((file, i) => (
            <Thumb key={file.id} prompt={prompt} file={file} n={i + 1} ratio={shapes[i]!.ratio} />
          ))}
        </div>
      ) : entry.prompt ? (
        <div className="empty-drop">
          <DropIcon className="ic" />
          <span>No images yet. Drop Midjourney's four files anywhere on the board.</span>
        </div>
      ) : null}
    </>
  );
}

function Thumb({ prompt, file, n, ratio }: { prompt: ShownPrompt; file: FileEntry; n: number; ratio: string }) {
  const { doc, projectId, marks, openViewer } = useBoardContext();
  const local = useLocalFiles(projectId);
  const { chosen: chosenId, prompt: entry } = prompt.row;
  const chosen = chosenId === file.id;
  const others = chosenId !== null && !chosen;
  const open = () => openViewer(entry.id, file.id);
  return (
    <div
      className={`th-i${chosen ? ' chosen' : others ? ' others' : ''}`}
      style={{ aspectRatio: ratio }}
      role="button"
      tabIndex={0}
      aria-label={`Open image ${n} of ${promptLabel(prompt)}`}
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
          toggleImage(doc, entry.id, file.id);
        }}
      >
        {chosen ? '✓' : ''}
      </button>
      {marks.has(file.id) && <span className="badge new">new</span>}
      {local.has(file.sha256) ? (
        <span className="badge dev" title={localTitle(local.get(file.sha256)!)}>
          <LaptopIcon className="ic" />
          on this device
        </span>
      ) : (
        <span className="idx">{n}</span>
      )}
    </div>
  );
}
