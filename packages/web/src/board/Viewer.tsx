import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FileEntry, MatchedBy } from 'promptbook-project';
import { snapshotTime } from '../dates.js';
import { Confirm } from '../ui/Confirm.js';
import { CheckIcon, NextIcon, PrevIcon, TrashIcon } from '../ui/icons.js';
import { moveFile, REMOVE_NOTE, removeFromScene, removeQuestion, toggleChoice } from './actions.js';
import { useBoardContext } from './context.js';
import { FileImage } from './parts.js';
import { fileSize, sceneLabel } from './summary.js';

const matchedLabels: Record<MatchedBy, string> = {
  prompt: "the prompt's first words",
  title: 'the track title',
  hand: 'you, by hand',
};

// «PNG», «JPEG», «WEBP».
const typeOf = (mime: string) => (mime.split('/')[1] ?? '').toUpperCase();

// The image viewer (screen 6): one scene's images, the one shown named by its
// id, so the list may change under it (Claude, another tab). When the image
// leaves the scene or the project, the viewer closes.
export function Viewer({
  sceneId,
  fileId,
  onShow,
  onClose,
}: {
  sceneId: string;
  fileId: string;
  onShow(fileId: string): void;
  onClose(): void;
}) {
  const { doc, projectId, rows, toast } = useBoardContext();
  const [confirm, setConfirm] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const row = rows.find((r) => r.sceneId === sceneId);
  const images = row?.images ?? [];
  const index = images.findIndex((f) => f.id === fileId);
  const file: FileEntry | undefined = images[index];

  const gone = !row || !file;
  useEffect(() => {
    if (gone && !confirm) onClose();
  }, [gone, confirm, onClose]);

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
      if (e.key === 'Escape') latest.current.onClose();
      if (e.key === 'ArrowLeft') latest.current.step(-1);
      if (e.key === 'ArrowRight') latest.current.step(1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  if (!row || !file) return null;
  const chosen = row.chosenImage === file.id;
  const status = chosen ? (
    <span className="who-you">Chosen for this scene</span>
  ) : row.chosenImage ? (
    'Another image is chosen'
  ) : (
    'None chosen yet'
  );
  const question = removeQuestion(row, file);

  return createPortal(
    <div
      className="viewer-scrim board-layer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="viewer" role="dialog" aria-modal="true" aria-label="Image viewer">
        <div className="stagei">
          <FileImage className="big" projectId={projectId} file={file} full key={file.id} />
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
            <span className="panel-h">{sceneLabel(row)}</span>
            <button className="tb sm" title="Close (Esc)" aria-label="Close" ref={closeButton} onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="fn">{file.name}</div>
          <dl className="kv">
            <dt>Scene</dt>
            <dd>{sceneLabel(row)}</dd>
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
              {snapshotTime(file.addedAt)} by {file.addedBy === 'claude' ? 'Claude' : 'you'}
            </dd>
            <dt>Status</dt>
            <dd>{status}</dd>
          </dl>
          <div className="strip">
            {images.map((g, j) => (
              <button
                key={g.id}
                className={`${g.id === file.id ? 'cur' : ''}${row.chosenImage === g.id ? ' ch' : ''}`}
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
                if (toggleChoice(doc, row.sceneId, file)) toast(`Chosen for ${row.sceneId}.`);
              }}
            >
              {chosen ? (
                '✓ Chosen · click to unchoose'
              ) : (
                <>
                  <CheckIcon />
                  Choose for this scene
                </>
              )}
            </button>
            <select
              aria-label="Move to another scene"
              value=""
              onChange={(e) => {
                const to = e.target.value;
                if (!to) return;
                onClose();
                const said = moveFile(doc, rows, file.id, to);
                if (said) toast(said);
              }}
            >
              <option value="">Move to another scene…</option>
              {rows
                .filter((r) => r.sceneId !== row.sceneId)
                .map((r) => (
                  <option key={r.sceneId} value={r.sceneId}>
                    {sceneLabel(r)}
                  </option>
                ))}
            </select>
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
            const said = removeFromScene(doc, file);
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
