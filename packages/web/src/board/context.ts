import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { BoardRow, FileEntry } from 'promptbook-project';
import type * as Y from 'yjs';
import { platform } from '../platform/index.js';

// What every part of the board shares: the document, the rows as drawn, the
// new marks, the toast, the viewer and the one audio player.
export interface BoardContextValue {
  doc: Y.Doc;
  projectId: string;
  rows: BoardRow[];
  marks: ReadonlySet<string>;
  toast(message: string): void;
  openViewer(sceneId: string, fileId: string): void;
  player: Player;
  // A file assigned by hand from the tray is marked new.
  mark(fileId: string): void;
}

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
