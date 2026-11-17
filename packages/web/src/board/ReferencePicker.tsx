import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_REFERENCES, setPromptReferences, type ImagePromptEntry } from 'promptbook-project';
import { useBoardContext } from './context.js';
import { useLocalFiles } from './device.js';
import { FileImage } from './parts.js';
import {
  addLabel,
  boardImages,
  cardLine,
  missingLine,
  referenceLabels,
  referencesHint,
  tileState,
  togglePick,
} from './references.js';

// The Generate panel's «References» block (reference-images design
// decisions 12 to 14, mockup screens 11 and 12): the picked images with a
// remove button each, «+ Add» while fewer than three are picked, and the
// grid of the board's images to pick from. Every pick and removal is
// written to the prompt at once, so it syncs and is there next time.
export function ReferencesBlock({ entry }: { entry: ImagePromptEntry }) {
  const { doc, projectId, shown, files, toast } = useBoardContext();
  const local = useLocalFiles(projectId);
  const [open, setOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const picked = entry.references;
  const labels = useMemo(() => referenceLabels(shown, files), [shown, files]);
  const byId = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const full = picked.length >= MAX_REFERENCES;

  const write = (next: readonly string[]) => {
    try {
      setPromptReferences(doc, entry.id, next, 'user');
    } catch {
      // The prompt went meanwhile (Claude, another tab): the panel goes too.
      toast('This prompt is no longer on the board.');
    }
  };

  const closeGrid = () => {
    setOpen(false);
    addButton.current?.focus();
  };

  return (
    <div className="refblock">
      {entry.missingReferences > 0 && (
        <p className="refgone" role="status">
          {missingLine(entry.missingReferences)}
        </p>
      )}
      <div className="gl">
        References <span>{referencesHint(picked.length)}</span>
      </div>
      <div className="refs">
        {picked.map((id) => {
          const file = byId.get(id);
          const label = labels.get(id) ?? '';
          return (
            <div className="ref" key={id}>
              {file ? <FileImage className="rimg" projectId={projectId} file={file} /> : <span className="rimg" />}
              <span className="rl">{label}</span>
              <button
                className="rx"
                title="Remove this reference"
                aria-label={`Remove ${label}`}
                onClick={() => write(picked.filter((p) => p !== id))}
              >
                ✕
              </button>
            </div>
          );
        })}
        {!full && (
          <button className="refadd" ref={addButton} aria-expanded={open} onClick={() => setOpen(!open)}>
            {addLabel(picked.length)}
          </button>
        )}
      </div>
      {open && (
        <ReferenceGrid
          picked={picked}
          onlyHere={(sha) => local.has(sha)}
          onToggle={(id) => write(togglePick(picked, id))}
          onClose={closeGrid}
        />
      )}
      {picked.length > 0 && <div className="refnote">Sent with the prompt and kept on this prompt for next time.</div>}
    </div>
  );
}

// The board's images as a listbox: chosen images first, then board order;
// one tile in the tab order, the arrows move between them, Enter or Space
// picks, Escape closes the grid. A tile that cannot be picked stays
// focusable and says why in its title.
function ReferenceGrid({
  picked,
  onlyHere,
  onToggle,
  onClose,
}: {
  picked: readonly string[];
  onlyHere(sha256: string): boolean;
  onToggle(fileId: string): void;
  onClose(): void;
}) {
  const { projectId, shown } = useBoardContext();
  const images = useMemo(() => boardImages(shown), [shown]);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  if (images.length === 0) return <div className="refnote">No images on this board yet.</div>;
  const current = Math.min(active, images.length - 1);

  const focus = (i: number) => {
    const next = Math.max(0, Math.min(images.length - 1, i));
    setActive(next);
    list.current?.querySelectorAll<HTMLElement>('[role=option]')[next]?.focus();
  };
  // Tiles per line, from where they sit, for Up and Down.
  const perLine = () => {
    const tiles = list.current?.querySelectorAll<HTMLElement>('[role=option]');
    if (!tiles || tiles.length === 0) return 1;
    const top = tiles[0]!.offsetTop;
    let n = 0;
    for (const tile of tiles) {
      if (tile.offsetTop !== top) break;
      n += 1;
    }
    return Math.max(1, n);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => number> = {
      ArrowRight: () => current + 1,
      ArrowLeft: () => current - 1,
      ArrowDown: () => current + perLine(),
      ArrowUp: () => current - perLine(),
      Home: () => 0,
      End: () => images.length - 1,
    };
    if (e.key === 'Escape') {
      // The grid only: the panel stays open.
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    focus(move());
  };

  return (
    <div
      className="refgrid"
      role="listbox"
      aria-label="Images on this board"
      aria-multiselectable="true"
      ref={list}
      onKeyDown={onKey}
    >
      {images.map(({ file, label, chosen }, i) => {
        const state = tileState(file.id, picked, onlyHere(file.sha256));
        return (
          <button
            key={file.id}
            type="button"
            role="option"
            className={state.selected ? 'on' : undefined}
            aria-selected={state.selected}
            aria-disabled={state.disabled !== null || undefined}
            title={state.disabled ?? undefined}
            tabIndex={i === current ? 0 : -1}
            onFocus={() => setActive(i)}
            onClick={() => {
              if (state.disabled === null) onToggle(file.id);
            }}
          >
            <FileImage className="rimg" projectId={projectId} file={file} />
            <span className="rl">
              {chosen && <b className="ck">✓ </b>}
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Under a prompt's buttons: «References: Padre Anselmo, S1 · 2» (D16).
export function ReferencesLine({ entry }: { entry: ImagePromptEntry }) {
  const { shown, files } = useBoardContext();
  const labels = useMemo(() => referenceLabels(shown, files), [shown, files]);
  const line = cardLine(entry.references, labels);
  return line ? <div className="refline">{line}</div> : null;
}
