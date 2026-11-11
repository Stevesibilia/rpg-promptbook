import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { BoardRow, FileEntry, GenerationJob, ImageCategory, ImageShape } from 'promptbook-project';
import type { GenerateBody, SpendingTotal } from '../api.js';
import type * as Y from 'yjs';
import { platform } from '../platform/index.js';
import type { GenerateChoice } from './generate.js';
import type { Named, ShownPrompt } from './summary.js';
import type { PendingStart, Refused, StatusState } from './useGeneration.js';

// Where the one new prompt is being written: a scene's stack, or the PCs,
// NPCs or Handouts grid.
export type Adding = { category: 'scene'; sceneId: string } | { category: Exclude<ImageCategory, 'scene'> };

export const addingKey = (a: Adding) => (a.category === 'scene' ? `scene:${a.sceneId}` : a.category);

// What every part of the board shares: the document, the rows, cards and
// prompts as drawn, the new marks, the toast, the viewer and the one audio
// player.
export interface BoardContextValue {
  doc: Y.Doc;
  projectId: string;
  rows: BoardRow[];
  named: Named;
  shown: ReadonlyMap<string, ShownPrompt>;
  marks: ReadonlySet<string>;
  toast(message: string): void;
  openViewer(promptId: string, fileId: string): void;
  player: Player;
  // A file assigned by hand from the tray is marked new.
  mark(fileId: string): void;
  // The prompts (by id) and music halves (`<sceneId>/music`) with an editor
  // open, the prompts (`<id>/remove`) and tracks (`<sceneId>/track`) with a
  // confirm open, and the prompt (`<id>/generate`) with its Generate panel,
  // kept on the board whatever the filter, so a draft, a question or a panel
  // is never unmounted by a change of state.
  editing: ReadonlySet<string>;
  setEditing(key: string, on: boolean): void;
  // One new prompt at a time: Add elsewhere drops an unsaved one.
  adding: Adding | null;
  setAdding(adding: Adding | null): void;
  generation: Generation;
}

// Image generation on the board (board-image-generation design decision 13).
export interface Generation {
  // The signed-in user's id: a job's `by`.
  user: string;
  // Offline on the desktop: Generate is off.
  offline: boolean;
  status: StatusState;
  retryStatus(): void;
  defaults: GenerateChoice;
  // The job each prompt shows: its running one, else its newest error.
  jobs: ReadonlyMap<string, GenerationJob>;
  // Starts the server took whose job has not shown yet, by prompt.
  pending: ReadonlyMap<string, PendingStart>;
  shapes: ReadonlyMap<string, ImageShape>;
  start(promptId: string, body: GenerateBody): Promise<Refused | null>;
  // «Generated here»; null to hide it.
  spending: SpendingTotal | null;
  // The prompt whose Generate panel is open: one at a time.
  open: string | null;
  setOpen(promptId: string | null): void;
}

// A prompt held on the board whatever the filter: its editor, its remove
// confirm or its Generate panel is open.
export const held = (editing: ReadonlySet<string>, promptId: string) =>
  editing.has(promptId) || editing.has(`${promptId}/remove`) || editing.has(`${promptId}/generate`);

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error('useBoardContext outside the board');
  return value;
}

export interface Player {
  // The file loaded, playing or paused.
  current: string | null;
  playing: boolean;
  time: number;
  duration: number;
  toggle(file: FileEntry): void;
  seek(seconds: number): void;
  stop(): void;
}

// One <audio> element for the board (asset-board design decision 12): the
// browser streams the file with ranges, and playing another track stops the
// first. Let go when the board is.
export function usePlayer(projectId: string): Player {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const element = new Audio();
    element.preload = 'metadata';
    const sync = () => {
      setPlaying(!element.paused && !element.ended);
      setTime(element.currentTime);
      setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    };
    for (const event of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange']) {
      element.addEventListener(event, sync);
    }
    audio.current = element;
    return () => {
      for (const event of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange']) {
        element.removeEventListener(event, sync);
      }
      element.pause();
      element.removeAttribute('src');
      element.load();
      audio.current = null;
    };
  }, []);

  const stop = () => {
    const element = audio.current;
    if (element) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    setCurrent(null);
    setPlaying(false);
    setTime(0);
    setDuration(0);
  };

  return {
    current,
    playing,
    time,
    duration,
    toggle(file) {
      const element = audio.current;
      if (!element) return;
      if (current === file.id) {
        if (element.paused) void element.play().catch(() => {});
        else element.pause();
        return;
      }
      element.src = platform.fileUrl(projectId, file.sha256);
      setCurrent(file.id);
      setTime(0);
      setDuration(file.duration ?? 0);
      void element.play().catch(() => {});
    },
    seek(seconds) {
      const element = audio.current;
      if (element && Number.isFinite(seconds)) element.currentTime = seconds;
    },
    stop,
  };
}
