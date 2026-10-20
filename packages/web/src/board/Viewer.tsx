import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FileEntry, MatchedBy } from 'promptbook-project';
import { snapshotTime } from '../dates.js';
import { Confirm } from '../ui/Confirm.js';
import { CheckIcon, NextIcon, PrevIcon, TrashIcon } from '../ui/icons.js';
import { ActionSelect } from './ActionSelect.js';
import { imageQuestion, moveImage, REMOVE_NOTE, removeFromBoard, toggleImage } from './actions.js';
import { useBoardContext } from './context.js';
import { useLocalFiles } from './device.js';
import { FileImage } from './parts.js';
import { fileSize, promptGroups, promptLabel, sceneLabel, shapeOf, tabLabel } from './summary.js';

const matchedLabels: Record<MatchedBy, string> = {
  prompt: "the prompt's first words",
  title: 'the track title',
  hand: 'you, by hand',
};

// «PNG», «JPEG», «WEBP».
const typeOf = (mime: string) => (mime.split('/')[1] ?? '').toUpperCase();

// The image viewer (screen 6): one prompt's images, the one shown named by
// its id, so the list may change under it (Claude, another tab). When the
// image leaves the prompt or the project, or the prompt goes, the viewer
// closes.
export function Viewer({
  promptId,
  fileId,
  onShow,
  onClose,
}: {
  promptId: string;
  fileId: string;
  onShow(fileId: string): void;
  onClose(): void;
}) {
  const { doc, projectId, rows, shown, toast } = useBoardContext();
  const local = useLocalFiles(projectId);
  const [confirm, setConfirm] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const prompt = shown.get(promptId);
  const images = prompt?.row.images ?? [];
  const index = images.findIndex((f) => f.id === fileId);
  const file: FileEntry | undefined = images[index];

  // Gone meanwhile, even with the confirm open: the confirm goes too, so it
  // never asks about another image.
  const gone = !prompt || !file;
  useEffect(() => {
    if (!gone) return;
    setConfirm(false);
    onClose();
  }, [gone, onClose]);
  useEffect(() => setConfirm(false), [fileId]);

  const step = (by: number) => {
    if (images.length === 0) return;
    onShow(images[(index + by + images.length) % images.length]!.id);
  };
  const latest = useRef({ step, onClose, confirm });
  latest.current = { step, onClose, confirm };

  useEffect(() => {
    closeButton.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (latest.current.confirm) return;
      // The Move select's own keys.
      if (e.key !== 'Escape' && (e.target as Element | null)?.closest?.('select, input, textarea')) return;
      if (e.key === 'Escape') latest.current.onClose();
      if (e.key === 'ArrowLeft') latest.current.step(-1);
      if (e.key === 'ArrowRight') latest.current.step(1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  if (!prompt || !file) return null;
  const { chosen: chosenId } = prompt.row;
  const chosen = chosenId === file.id;
  const status = chosen ? (
    <span className="who-you">Chosen for this prompt</span>
  ) : chosenId ? (
    'Another image is chosen'
  ) : (
    'None chosen yet'
  );
  const question = imageQuestion(prompt, file);
  const shape = shapeOf(file);
  // «S3 · L'ordine di Donato», «NPCs · Dottor Salvi».
  const header = prompt.scene ? sceneLabel(prompt.scene) : tabLabel(prompt);

  return createPortal(
    <div
      className="viewer-scrim board-layer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="viewer" role="dialog" aria-modal="true" aria-label="Image viewer">
        <div className="stagei">
          <FileImage className={`big${shape.tall ? ' tall' : ''}`} projectId={projectId} file={file} full key={file.id} />
          {images.length > 1 && (
            <>
              <button className="nav l" title="Previous (←)" aria-label="Previous" onClick={() => step(-1)}>
                <PrevIcon className="ic" />
              </button>
              <button className="nav r" title="Next (→)" aria-label="Next" onClick={() => step(1)}>
                <NextIcon className="ic" />
              </button>
            </>
          )}
          <div className="ctr">
            {index + 1} of {images.length}
          </div>
        </div>
        <div className="side">
          <div className="top">
            <span className="panel-h">{header}</span>
            <button className="tb sm" title="Close (Esc)" aria-label="Close" ref={closeButton} onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="fn">{file.name}</div>
          <dl className="kv">
            <dt>Prompt</dt>
            <dd>{promptLabel(prompt, true)}</dd>
            <dt>Size</dt>
            <dd>
              {fileSize(file.size)} · {typeOf(file.mime)}
            </dd>
            {file.width && file.height ? (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {file.width} × {file.height} px
                </dd>
              </>
            ) : null}
            <dt>Matched by</dt>
            <dd>{file.matchedBy ? matchedLabels[file.matchedBy] : '—'}</dd>
            <dt>Added</dt>
            <dd>
              {snapshotTime(file.addedAt)}
              {local.has(file.sha256) ? ' · on this device' : ` by ${file.addedBy === 'claude' ? 'Claude' : 'you'}`}
            </dd>
            <dt>Status</dt>
            <dd>{status}</dd>
          </dl>
          <div className="strip">
            {images.map((g, j) => (
              <button
                key={g.id}
                className={`${g.id === file.id ? 'cur' : ''}${chosenId === g.id ? ' ch' : ''}`}
                title={`Image ${j + 1}`}
                aria-label={`Image ${j + 1}`}
                onClick={() => onShow(g.id)}
              >
                <FileImage projectId={projectId} file={g} />
              </button>
            ))}
          </div>
          <div className="acts">
            <button
              className={`tb ${chosen ? 'line' : 'primary'}`}
              onClick={() => {
                if (toggleImage(doc, promptId, file.id)) toast(`Chosen for ${promptLabel(prompt)}.`);
              }}
            >
              {chosen ? (
                '✓ Chosen · click to unchoose'
              ) : (
                <>
                  <CheckIcon />
                  Choose for this prompt
                </>
              )}
            </button>
            <ActionSelect
              label="Move to another prompt"
              placeholder="Move to another prompt…"
              options={promptGroups(shown, { except: promptId })}
              onPick={(to) => {
                onClose();
                const said = moveImage(
                  doc,
                  shown,
                  rows.map((r) => r.sceneId),
                  file.id,
                  to,
                );
                if (said) toast(said);
              }}
            />
            <button className="tb danger" onClick={() => setConfirm(true)}>
              <TrashIcon />
              Remove
            </button>
          </div>
        </div>
      </div>
      {confirm && (
        <Confirm
          title={question.title}
          note={REMOVE_NOTE}
          action="Remove"
          danger
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            // The next image takes its place; the last one closes the viewer.
            const rest = images.filter((f) => f.id !== file.id);
            const said = removeFromBoard(doc, file);
            if (said) toast(said);
            if (rest.length > 0) onShow(rest[Math.min(index, rest.length - 1)]!.id);
            else onClose();
          }}
        >
          {question.text}
        </Confirm>
      )}
    </div>,
    document.body,
  );
}
