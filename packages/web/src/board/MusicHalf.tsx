import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setMusicPrompt, type BoardRow, type FileEntry, type MusicPrompt } from 'promptbook-project';
import { Confirm } from '../ui/Confirm.js';
import { DropIcon, EditIcon, MusicIcon } from '../ui/icons.js';
import { ActionSelect } from './ActionSelect.js';
import { moveTrack, REMOVE_NOTE, removeFromBoard, toggleTrack, trackQuestion } from './actions.js';
import { useBoardContext } from './context.js';
import { CopyButton } from './CopyButton.js';
import { localTitle, useLocalFiles } from './device.js';
import { Provenance, SourceLine, StatusChip } from './parts.js';
import { MusicPromptEditor } from './PromptEditor.js';
import { duration, sceneOwner, trackGroups, trackPlaces, type TrackOwner } from './summary.js';

// The Music · Suno half of a row (screen 1).
export function MusicHalf({ row, dim }: { row: BoardRow; dim: boolean }) {
  const { doc, projectId, toast, setEditing: hold } = useBoardContext();
  // The board keeps the row shown while its editor is open.
  const [editing, setEditingHere] = useState(false);
  const setEditing = (on: boolean) => {
    setEditingHere(on);
    hold(`${row.sceneId}/music`, on);
  };
  useEffect(() => () => hold(`${row.sceneId}/music`, false), [hold, row.sceneId]);
  const { music } = row;

  let prompt;
  if (editing) {
    prompt = (
      <MusicPromptEditor
        idPrefix={`ed-${row.sceneId}`}
        current={music}
        onSave={(next) => {
          setMusicPrompt(doc, row.sceneId, next, 'user');
          setEditing(false);
          toast('Saved.');
        }}
        onCancel={() => setEditing(false)}
      />
    );
  } else if (music) {
    prompt = <MusicPromptBox music={music} onEdit={() => setEditing(true)} />;
  } else {
    prompt = (
      <div className="noprompt">
        <span>No Suno prompt yet. Ask Claude, or write one.</span>
        <button className="tb sm line" onClick={() => setEditing(true)}>
          <EditIcon />
          Write by hand
        </button>
      </div>
    );
  }

  return (
    <div className={`half${dim ? ' dim' : ''}`} data-half={row.musicStatus}>
      <div className="hh">
        <span className="lab">
          <MusicIcon className="ic" />
          Music · Suno
        </span>
        <StatusChip status={row.musicStatus} />
      </div>
      <SourceLine label="mood" text={row.mood} projectId={projectId} sceneId={row.sceneId} />
      {prompt}
      <Tracks owner={sceneOwner(row)} prompted={music !== null} />
    </div>
  );
}

// A Suno prompt as the board shows it: Title, Style and Lyrics with Copy,
// Suno's fixed settings, who wrote it, and Edit. A scene's music half and a
// General music card share it.
export function MusicPromptBox({ music, onEdit }: { music: MusicPrompt; onEdit(): void }) {
  const { toast } = useBoardContext();
  const title = useRef<HTMLSpanElement>(null);
  const style = useRef<HTMLSpanElement>(null);
  const lyrics = useRef<HTMLSpanElement>(null);
  return (
    <div className="pbox">
      <div className="parts3">
        <span className="pl">Title</span>
        <span className="pv title">
          <span ref={title}>{music.title}</span>
          <small>The download's filename. Used to match tracks.</small>
        </span>
        <span className="pc">
          <CopyButton text={music.title} source={title} onFallback={toast} />
        </span>
        <span className="pl">Style</span>
        <span className="pv" ref={style}>
          {music.style}
        </span>
        <span className="pc">
          <CopyButton text={music.style} source={style} onFallback={toast} />
        </span>
        <span className="pl">Lyrics</span>
        <span className="pv lyr" ref={lyrics}>
          {music.lyrics.split('\n').map((line, i) => (
            <Fragment key={i}>
              {i > 0 && ' '}
              <span>{line}</span>
            </Fragment>
          ))}
        </span>
        <span className="pc">
          <CopyButton text={music.lyrics} source={lyrics} onFallback={toast} />
        </span>
      </div>
      <div className="fixed">Instrumental: ON · Weirdness: low · Style Influence: strong</div>
      <div className="pfoot">
        <Provenance by={music.by} at={music.at} />
        <button className="tb sm" onClick={onEdit}>
          <EditIcon />
          Edit
        </button>
      </div>
    </div>
  );
}

// The tracks of a scene or a General music prompt, oldest first; with none,
// where they come from once there is a prompt.
export function Tracks({ owner, prompted }: { owner: TrackOwner; prompted: boolean }) {
  if (owner.tracks.length > 0) {
    return (
      <div className="tracks">
        {owner.tracks.map((file, i) => (
          <Track key={file.id} owner={owner} file={file} take={i + 1} />
        ))}
      </div>
    );
  }
  if (!prompted) return null;
  return (
    <div className="empty-drop">
      <DropIcon className="ic" />
      <span>No tracks yet. Drop Suno's downloads anywhere on the board.</span>
    </div>
  );
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4l13 8-13 8z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);

function Track({ owner, file, take }: { owner: TrackOwner; file: FileEntry; take: number }) {
  const { doc, projectId, marks, player } = useBoardContext();
  const local = useLocalFiles(projectId);
  const chosen = owner.chosen === file.id;
  const loaded = player.current === file.id;
  const playing = loaded && player.playing;
  const length = loaded && player.duration ? player.duration : file.duration;
  return (
    <div className={`trk-r${chosen ? ' chosen' : ''}${playing ? ' playing' : ''}`}>
      <button
        className="play"
        title={playing ? 'Pause' : 'Play'}
        aria-label={`${playing ? 'Pause' : 'Play'} take ${take}`}
        onClick={() => player.toggle(file)}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="fn" title={file.name}>
        {file.name}
        {marks.has(file.id) && <span className="newdot">new</span>}
        {local.has(file.sha256) && (
          <span className="devdot" title={localTitle(local.get(file.sha256)!)}>
            on this device
          </span>
        )}
        <small>Take {take}</small>
      </span>
      <span className="dur">{loaded && player.time > 0 ? duration(player.time) : duration(length)}</span>
      {chosen ? (
        <button className="chosen-tag" title="Click to unchoose" onClick={() => toggleTrack(doc, owner.target, file.id)}>
          ✓ Chosen
        </button>
      ) : (
        <button className="tb sm line" onClick={() => toggleTrack(doc, owner.target, file.id)}>
          Choose
        </button>
      )}
      <TrackMenu owner={owner} file={file} />
      {loaded && length ? (
        <input
          className="seek"
          type="range"
          aria-label={`Position in take ${take}`}
          min={0}
          max={length}
          step={0.1}
          value={Math.min(player.time, length)}
          onChange={(e) => player.seek(Number(e.target.value))}
        />
      ) : null}
    </div>
  );
}

// «⋯»: Move to another scene or music… and Remove, the image viewer's
// actions (asset-board design decision 12).
export function TrackMenu({ owner, file }: { owner: TrackOwner; file: FileEntry }) {
  const { doc, rows, music, toast, player, setEditing: hold } = useBoardContext();
  const [open, setOpen] = useState<'menu' | 'move' | null>(null);
  // While it asks, a change of status does not filter the row away.
  const [confirm, setConfirmHere] = useState(false);
  const setConfirm = (on: boolean) => {
    setConfirmHere(on);
    hold(`${owner.key}/track`, on);
  };
  useEffect(() => () => hold(`${owner.key}/track`, false), [hold, owner.key]);
  const box = useRef<HTMLSpanElement>(null);

  // Esc or a click outside closes it.
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const question = trackQuestion(owner, file);
  const places = open === 'move' ? trackPlaces(rows, music) : [];
  return (
    <span className="more" ref={box}>
      <button
        className="tb sm"
        title="More"
        aria-label={`More for take ${owner.tracks.indexOf(file) + 1}`}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        onClick={() => setOpen((o) => (o ? null : 'menu'))}
      >
        ⋯
      </button>
      {open && (
        <div className="menu" role="menu">
          {open === 'menu' ? (
            <>
              <button role="menuitem" onClick={() => setOpen('move')}>
                Move to another scene or music…
              </button>
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  setOpen(null);
                  setConfirm(true);
                }}
              >
                Remove
              </button>
            </>
          ) : (
            <ActionSelect
              label="Move to another scene or music"
              placeholder="Move to another scene or music…"
              autoFocus
              options={trackGroups(places, owner.target)}
              onPick={(to) => {
                setOpen(null);
                if (player.current === file.id) player.stop();
                const said = moveTrack(doc, places, file.id, to);
                if (said) toast(said);
              }}
            />
          )}
        </div>
      )}
      {/* Out of the half, which a filter may dim. */}
      {confirm &&
        createPortal(
          <Confirm
            title={question.title}
            note={REMOVE_NOTE}
            action="Remove"
            danger
            onClose={() => setConfirm(false)}
            onConfirm={() => {
              if (player.current === file.id) player.stop();
              const said = removeFromBoard(doc, file);
              if (said) toast(said);
            }}
          >
            {question.text}
          </Confirm>,
          document.body,
        )}
    </span>
  );
}
