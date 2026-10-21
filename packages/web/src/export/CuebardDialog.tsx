import { useContext } from 'react';
import { cuebardPack, readMeta, type CuebardSummary, type CuebardWarning } from 'promptbook-project';
import type * as Y from 'yjs';
import { DesktopContext } from '../desktop/context.js';
import type { CuebardSaved } from '../platform/bridge.js';
import { platform } from '../platform/index.js';
import { useDocValue } from '../sync/hooks.js';
import { DropIcon, LaptopIcon, WarningIcon } from '../ui/icons.js';
import { Modal } from '../ui/Modal.js';
import './cuebard.css';

// «Export for CueBard» (cuebard-export design decisions 16 and 17, the
// mockup's screens 10, 10b and 10c): what the pack holds, from the planner
// the server and the desktop run, over the document as it is, with no
// lengths read and nothing missing; one warning per gap. Warnings never
// stop the export: only nothing to export, or a pack too large, does.

// The server's ZIP_BYTES_MAX and ZIP_ENTRIES_MAX
// (packages/server/src/routes/zip.ts), kept equal.
const PACK_BYTES_MAX = 4_000_000_000;
const PACK_ENTRIES_MAX = 65_000;

export const TOO_LARGE =
  'This project holds more than 4 GB of images and tracks for CueBard, more than one pack can take. Choose fewer files on the board.';

export type CuebardState = 'empty' | 'too-large' | 'ready';

export function cuebardState(summary: CuebardSummary, entries: number): CuebardState {
  if (summary.empty) return 'empty';
  return summary.bytes > PACK_BYTES_MAX || entries + 2 > PACK_ENTRIES_MAX ? 'too-large' : 'ready';
}

// The toast once the export answered; null when there is nothing to say
// (the desktop's save dialog cancelled).
export function savedToast(kind: 'web' | 'desktop', name: string, saved: CuebardSaved): string | null {
  if (kind === 'web') return `Downloading ${name}.`;
  if (!saved.saved) return null;
  if (saved.leftOut === 0) return `Saved ${name}.`;
  const files = saved.leftOut === 1 ? '1 file was' : `${saved.leftOut} files were`;
  return `Saved ${name}. ${files} left out; the pack's left-out.txt lists them.`;
}

const NAMED = { pc: 'PC', npc: 'NPC', handout: 'Handout' } as const;

function WarningLine({ warning: w }: { warning: CuebardWarning }) {
  switch (w.kind) {
    case 'no-track':
      return (
        <>
          <b>{w.label}</b> has no track: its cue group is empty.
        </>
      );
    case 'no-image':
      return w.category === 'scene' ? (
        <>
          <b>{w.label}</b>
          {w.number !== null && `, prompt ${w.number},`} has no image.
        </>
      ) : (
        <>
          {NAMED[w.category]} <b>"{w.name}"</b> has no image.
        </>
      );
    case 'no-duration':
      return (
        <>
          <b>{w.label}</b>: the length of "{w.fileName}" is not recorded; the export reads it from the file, or
          leaves the track out.
        </>
      );
    case 'missing':
      return (
        <>
          <b>{w.label}</b>: "{w.fileName}" is not available, so it is left out.
        </>
      );
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// The dialog's body for a summary: the lead, then the lines and warnings,
// or nothing to export, or too large; where the pack is built.
export function CuebardSummaryView({
  summary,
  state,
  fileName,
  desktop,
}: {
  summary: CuebardSummary;
  state: CuebardState;
  fileName: string;
  desktop: boolean;
}) {
  const lead = <p>A CueBard project: one cue group per scene, with its tracks, and the images in four visual folders.</p>;
  if (state === 'empty') {
    return (
      <>
        {lead}
        <div className="xnone">Nothing to export yet: add files to the board first.</div>
      </>
    );
  }
  const sep = <span className="sep">·</span>;
  const { images, warnings } = summary;
  return (
    <>
      {lead}
      <dl className="xsum">
        <dt>Cue groups</dt>
        <dd>
          <b>{summary.groups}</b> {plural(summary.groups, 'scene', 'scenes')}
          {sep}
          <b>{summary.tracks}</b> {plural(summary.tracks, 'track', 'tracks')}
        </dd>
        <dt>Visual folders</dt>
        <dd>
          Scenes <b>{images.scene}</b>
          {sep}PCs <b>{images.pc}</b>
          {sep}NPCs <b>{images.npc}</b>
          {sep}Handouts <b>{images.handout}</b> <span className="hint">images</span>
        </dd>
      </dl>
      <p className="m">
        Each prompt and scene gives its chosen file, or every matched file when nothing is chosen. The Unmatched tray
        stays out.
      </p>
      {warnings.length > 0 && (
        <div className="xwarn">
          <h4>
            <WarningIcon className="ic" />
            {warnings.length} {plural(warnings.length, 'warning', 'warnings')}
          </h4>
          <ul>
            {warnings.map((warning, i) => (
              <li key={i}>
                <WarningLine warning={warning} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {state === 'too-large' && <p className="err">{TOO_LARGE}</p>}
      {desktop ? (
        <p className="xnote here">
          <LaptopIcon className="ic" />
          Built on this device, works offline.
        </p>
      ) : (
        <p className="xnote">
          <DropIcon className="ic" />
          Your browser downloads <code>{fileName}</code>
        </p>
      )}
    </>
  );
}

// The planner over the document, with no lengths read and nothing missing:
// the board the user sees, offline too.
const plan = (doc: Y.Doc) => {
  const pack = cuebardPack(doc, { now: '' });
  return { title: readMeta(doc).title, fileName: pack.fileName, summary: pack.summary, entries: pack.entries.length };
};

// The projects whose export runs: a second click, or a dialog opened again
// while the save dialog is up, does not start another.
const running = new Set<string>();

export function CuebardDialog({
  projectId,
  doc,
  onClose,
  onToast,
}: {
  projectId: string;
  doc: Y.Doc;
  onClose(): void;
  onToast(message: string): void;
}) {
  // Follows the document while open: a file added elsewhere counts at once.
  const { title, fileName, summary, entries } = useDocValue(doc, plan);
  const state = cuebardState(summary, entries);
  const kind = platform.kind;
  // The desktop's answer comes after its save dialog and the build, maybe
  // minutes later: the app's own toast shows it wherever the user went.
  const later = useContext(DesktopContext)?.toast ?? onToast;

  const start = () => {
    if (state !== 'ready') return;
    if (running.has(projectId)) {
      onToast(`${fileName} is being saved already.`);
      return;
    }
    running.add(projectId);
    // The desktop's save dialog takes over; the browser's download starts.
    onClose();
    platform
      .exportCuebard(projectId, title)
      .then(
        (saved) => {
          const message = savedToast(kind, fileName, saved);
          if (message) later(message);
        },
        (error: unknown) => later(error instanceof Error && error.message ? error.message : 'The export failed.'),
      )
      .finally(() => running.delete(projectId));
  };

  return (
    <Modal
      title="Export for CueBard"
      onClose={onClose}
      className="cbx"
      footer={
        <>
          <button className="tb line" onClick={onClose} autoFocus={state !== 'ready'}>
            Cancel
          </button>
          <button
            className="tb primary"
            onClick={start}
            disabled={state !== 'ready'}
            autoFocus={state === 'ready'}
          >
            Export
          </button>
        </>
      }
    >
      <CuebardSummaryView summary={summary} state={state} fileName={fileName} desktop={kind === 'desktop'} />
    </Modal>
  );
}
