import { useState } from 'react';
import type { UpdatesState } from '../platform/bridge.js';
import { useDesktop, useStore } from '../platform/hooks.js';
import { createStore } from '../platform/store.js';
import { DownloadIcon, ExternalIcon } from '../ui/icons.js';
import { paragraphs } from '../ui/inline.js';
import { Pieces } from '../ui/Markdown.js';
import { Modal } from '../ui/Modal.js';
import { useDesktopUi } from './context.js';

// Updates on the desktop (desktop-app design decision 14, desktop.html),
// driven by main's updater state: Windows and the AppImage download, then
// offer Restart now; a Mac or the deb package is told a version is
// available, with Download. Later moves the offer to the status bar.

type Offer = Extract<UpdatesState, { kind: 'ready' | 'available' }>;

// The version the user put off with Later, for the page's lifetime.
const later = createStore<string | null>(null);

const offerOf = (state: UpdatesState): Offer | null =>
  state.kind === 'ready' || state.kind === 'available' ? state : null;

// The release notes as lines: list items and paragraphs, as GitHub's
// Markdown or electron-updater's HTML gives them.
export function noteLines(notes: string): { item: boolean; text: string }[] {
  return notes
    .replace(/<\/(li|p|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^#+\s/.test(line))
    .map((line) => {
      const item = /^[-*]\s+/.test(line);
      return { item, text: item ? line.replace(/^[-*]\s+/, '') : line };
    });
}

function WhatsNew({ offer, onClose }: { offer: Offer; onClose(): void }) {
  const desktop = useDesktop();
  const ui = useDesktopUi();
  const lines = noteLines(offer.notes);
  const items = lines.filter((l) => l.item);
  return (
    <Modal
      title={`What's new in ${offer.version}`}
      onClose={onClose}
      className="whats-new"
      footer={
        <>
          <button
            className="link note"
            onClick={() => {
              void desktop.bridge.updates.openRelease();
              ui.toast('Opened the release notes on GitHub in your browser.');
            }}
          >
            Full release notes on GitHub
          </button>
          <button className="tb line" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {items.length ? (
        <ul className="notes">
          {items.map((l, i) => (
            <li key={i}>
              <Pieces pieces={paragraphs(l.text)[0] ?? []} />
            </li>
          ))}
        </ul>
      ) : (
        lines.map((l, i) => (
          <p key={i}>
            <Pieces pieces={paragraphs(l.text)[0] ?? []} />
          </p>
        ))
      )}
    </Modal>
  );
}

export function UpdateStrip() {
  const desktop = useDesktop();
  const state = useStore(desktop.updates);
  const info = useStore(desktop.info);
  const putOff = useStore(later);
  const ui = useDesktopUi();
  const [notes, setNotes] = useState(false);
  const offer = offerOf(state);
  if (!offer) return null;
  return (
    <>
      {putOff !== offer.version && (
        <div className="alert upd" role="status">
          <DownloadIcon className="ic info" />
          {offer.kind === 'ready' ? (
            <span>
              <b>Promptbook {offer.version} is ready.</b> Restart to update.
            </span>
          ) : (
            <span>
              <b>Promptbook {offer.version} is available.</b>
            </span>
          )}
          <button className="link" onClick={() => setNotes(true)}>
            What's new
          </button>
          <span className="spacer" />
          <span className="q">
            {offer.kind === 'ready'
              ? 'Open projects come back as you left them.'
              : info.os === 'linux'
                ? 'Download it, then install the package.'
                : 'Download it, then replace the app in Applications.'}
          </span>
          {offer.kind === 'ready' ? (
            <button
              className="tb primary"
              onClick={() => {
                ui.toast(`Restarting… Promptbook ${offer.version} opens where you left off.`);
                void desktop.bridge.updates.restart();
              }}
            >
              Restart now
            </button>
          ) : (
            <button
              className="tb primary"
              onClick={() => {
                void desktop.bridge.updates.openRelease();
                ui.toast(`Opened the Promptbook ${offer.version} release page on GitHub in your browser.`);
              }}
            >
              <ExternalIcon />
              Download
            </button>
          )}
          <button className="tb" onClick={() => later.set(offer.version)}>
            Later
          </button>
        </div>
      )}
      {notes && <WhatsNew offer={offer} onClose={() => setNotes(false)} />}
    </>
  );
}

// The status bar's update item: the download's progress, or the offer put
// off with Later.
export function UpdateStatus() {
  const state = useStore(useDesktop().updates);
  const putOff = useStore(later);
  if (state.kind === 'downloading') {
    return (
      <span className="upi">
        <span className="mini-bar">
          <i style={{ width: `${Math.round(state.percent)}%` }} />
        </span>
        Downloading Promptbook {state.version} · {Math.round(state.percent)}%
      </span>
    );
  }
  const offer = offerOf(state);
  if (!offer || putOff !== offer.version) return null;
  if (offer.kind === 'ready') return <span className="upi">Promptbook {offer.version} installs when you quit</span>;
  return (
    <span className="upi">
      <button className="link" onClick={() => later.set(null)}>
        Promptbook {offer.version} is available
      </button>
    </span>
  );
}
