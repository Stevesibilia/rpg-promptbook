import { useEffect, useRef } from 'react';
import { readFiles, setFileThumb, type FileEntry, type FileKind } from 'promptbook-project';
import type * as Y from 'yjs';
import { platform } from '../platform/index.js';
import { useDownloadsVersion } from './device.js';
import { nextThumbless } from './generate.js';
import { hashBytes } from './hash.js';
import type { Probed } from './intake.js';
import { probe } from './probe.js';

// Thumbnails for the images that arrive without one (board-image-generation
// design decision 12): the server has no image library, so a generated image
// lands with thumbSha256 null and the board fills it in. One file at a time;
// whichever device sets it first wins (setFileThumb writes only while it is
// still null). A file is tried once per page, so an image this browser cannot
// read is never retried in a loop; one whose bytes are not here yet (the
// desktop downloads them later) waits for the next download instead.

export interface BackfillDeps {
  // The file's bytes; null when they cannot be had now.
  fetchBytes(projectId: string, sha256: string): Promise<Uint8Array | null>;
  probe(blob: Blob, kind: FileKind): Promise<Probed>;
  hash(bytes: Uint8Array): Promise<string>;
  putFile(projectId: string, sha256: string, bytes: Uint8Array, mime: string): Promise<unknown>;
}

// Per project, for the page's life: a board shown again tries nothing twice.
const triedByProject = new Map<string, Set<string>>();

export class ThumbBackfill {
  private readonly tried: Set<string>;
  // Bytes not here yet: tried again after the next download.
  private readonly waiting = new Set<string>();
  private running = false;
  private again = false;
  private disposed = false;

  constructor(
    private readonly projectId: string,
    private readonly doc: Y.Doc,
    private readonly deps: BackfillDeps,
    tried?: Set<string>,
  ) {
    this.tried = tried ?? new Set();
  }

  // The files changed: look for work. Resolves when this round is over.
  async poke(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        for (;;) {
          if (this.disposed) return;
          const skip = new Set([...this.tried, ...this.waiting]);
          const file = nextThumbless(readFiles(this.doc), skip);
          if (!file) break;
          this.tried.add(file.id);
          await this.one(file);
        }
      } while (this.again);
    } finally {
      this.running = false;
    }
  }

  // A download ended: the files that waited for their bytes go again.
  retryWaiting(): Promise<void> {
    for (const id of this.waiting) this.tried.delete(id);
    this.waiting.clear();
    return this.poke();
  }

  // The files that waited are tried again by the next board shown.
  dispose(): void {
    this.disposed = true;
    for (const id of this.waiting) this.tried.delete(id);
    this.waiting.clear();
  }

  private stillThumbless(fileId: string): boolean {
    return readFiles(this.doc).some((f) => f.id === fileId && f.thumbSha256 === null);
  }

  private async one(file: FileEntry): Promise<void> {
    try {
      const bytes = await this.deps.fetchBytes(this.projectId, file.sha256).catch(() => null);
      if (!bytes) {
        if (this.disposed) this.tried.delete(file.id);
        else this.waiting.add(file.id);
        return;
      }
      if (this.disposed || !this.stillThumbless(file.id)) return;
      const probed = await this.deps.probe(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: file.mime }), 'image');
      if (!probed.thumb || this.disposed || !this.stillThumbless(file.id)) return;
      const sha = await this.deps.hash(probed.thumb.bytes);
      await this.deps.putFile(this.projectId, sha, probed.thumb.bytes, probed.thumb.mime);
      if (this.disposed) return;
      setFileThumb(this.doc, file.id, sha);
    } catch {
      // Unreadable, refused or gone: the original keeps showing.
    }
  }
}

async function fetchBytes(projectId: string, sha256: string): Promise<Uint8Array | null> {
  const answer = await fetch(platform.fileUrl(projectId, sha256), { credentials: 'include' });
  if (!answer.ok) return null;
  return new Uint8Array(await answer.arrayBuffer());
}

const deps: BackfillDeps = {
  fetchBytes,
  probe,
  hash: (bytes) => hashBytes(bytes),
  putFile: (projectId, sha256, bytes, mime) => platform.putFile(projectId, sha256, bytes, mime),
};

// The board's backfill: looks again whenever the files change, and on the
// desktop when a download ends.
export function useThumbBackfill(projectId: string, doc: Y.Doc, files: readonly FileEntry[]): void {
  const backfill = useRef<ThumbBackfill | null>(null);
  const downloads = useDownloadsVersion();
  useEffect(() => {
    let tried = triedByProject.get(projectId);
    if (!tried) triedByProject.set(projectId, (tried = new Set()));
    const made = new ThumbBackfill(projectId, doc, deps, tried);
    backfill.current = made;
    return () => {
      made.dispose();
      backfill.current = null;
    };
  }, [projectId, doc]);
  useEffect(() => {
    void backfill.current?.poke();
  }, [files]);
  useEffect(() => {
    if (downloads > 0) void backfill.current?.retryWaiting();
  }, [downloads]);
}
