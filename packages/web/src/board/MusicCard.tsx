import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MusicCardRow } from 'promptbook-project';
import { Confirm } from '../ui/Confirm.js';
import { TrashIcon, WarningIcon } from '../ui/icons.js';
import { addMusic, EMPTY_TITLE, musicQuestion, removeMusic, saveMusic } from './actions.js';
import { useBoardContext } from './context.js';
import { MusicPromptBox, Tracks } from './MusicHalf.js';
import { StatusChip } from './parts.js';
import { MusicPromptEditor } from './PromptEditor.js';
import { musicLabel, musicOwner } from './summary.js';

// A General music prompt's card (general-board-items design decision 9,
// screen 1a): its title, status and Remove; the Suno prompt with Copy, or
// its editor; its tracks, as a scene's music half shows them.

export const DUPLICATE_TITLE =
  'Title used twice: another scene or General music prompt has this title, so its tracks cannot match. Give each its own title.';

export function MusicCard({ card }: { card: MusicCardRow }) {
  const { doc, toast, setEditing: hold } = useBoardContext();
  const owner = musicOwner(card);
  const id = card.prompt.id;
  // The board keeps the card shown while its editor is open.
  const [editing, setEditingHere] = useState(false);
  const setEditing = (on: boolean) => {
    setEditingHere(on);
    hold(`${owner.key}/music`, on);
  };
  useEffect(() => () => hold(`music:${id}/music`, false), [hold, id]);
  const music = { ...card.prompt };

  return (
    <article className="card ent mus" id={`m-${id}`} data-status={card.status}>
      <div className="eh">
        <span className="enm">{card.prompt.title}</span>
        <StatusChip status={card.status} />
        <RemoveMusic card={card} />
      </div>
      <div className="eb">
        {card.duplicateTitle && (
          <div className="dup" role="note">
            <WarningIcon className="ic" />
            {DUPLICATE_TITLE}
          </div>
        )}
        {editing ? (
          <MusicPromptEditor
            idPrefix={`ed-music-${id}`}
            current={music}
            onEmptyTitle={() => toast(EMPTY_TITLE)}
            onSave={(next) => {
              setEditing(false);
              if (saveMusic(doc, id, next)) toast('Saved.');
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <MusicPromptBox music={music} onEdit={() => setEditing(true)} />
        )}
        <Tracks owner={owner} prompted />
      </div>
    </article>
  );
}

function RemoveMusic({ card }: { card: MusicCardRow }) {
  const { doc, toast, player, setEditing: hold } = useBoardContext();
  // Removed meanwhile (Claude, another tab), the card goes, its confirm too;
  // while it asks, a change of status does not filter it away.
  const id = card.prompt.id;
  const [confirm, setConfirmHere] = useState(false);
  const setConfirm = (on: boolean) => {
    setConfirmHere(on);
    hold(`music:${id}/remove`, on);
  };
  useEffect(() => () => hold(`music:${id}/remove`, false), [hold, id]);
  const question = musicQuestion(card);
  return (
    <>
      <button
        className="tb xs rm"
        title="Remove this music prompt"
        aria-label={`Remove ${musicLabel(card)}`}
        onClick={() => setConfirm(true)}
      >
        <TrashIcon />
      </button>
      {confirm &&
        createPortal(
          <Confirm
            title={question.title}
            note={question.note}
            action="Remove"
            danger
            onClose={() => setConfirm(false)}
            onConfirm={() => {
              if (player.current !== null && card.tracks.some((f) => f.id === player.current)) player.stop();
              const said = removeMusic(doc, id);
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

// «Add music prompt» (screen 7c): a card «New music prompt» with Title,
// Style and Lyrics; nothing is written before Add.
export function AddMusicCard({ onDone }: { onDone(): void }) {
  const { doc, toast } = useBoardContext();
  // Add once, however fast it is pressed again.
  const done = useRef(false);
  return (
    <article className="card ent mus">
      <div className="eh">
        <span className="enm new">New music prompt</span>
      </div>
      <div className="eb">
        <MusicPromptEditor
          idPrefix="add-music"
          current={null}
          action="Add"
          titlePlaceholder="Tema di Sabaoth"
          onEmptyTitle={() => toast(EMPTY_TITLE)}
          onSave={(next) => {
            if (done.current) return;
            const { added, said } = addMusic(doc, next);
            toast(said);
            // The project full: the draft stays.
            if (!added) return;
            done.current = true;
            onDone();
          }}
          onCancel={onDone}
        />
      </div>
    </article>
  );
}
