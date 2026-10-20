import {
  addFiles,
  CAPS,
  FILE_LIMITS,
  MAX_FILE_BYTES,
  matchFile,
  parseSuno,
  readFiles,
  readImagePrompts,
  sniff,
  SNIFF_BYTES,
  type FileEntry,
  type FileKind,
  type NamedCategory,
  type NewFile,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { targetsOf } from './actions.js';
import { categoryText, newName } from './summary.js';
import type { PutFileResult } from '../platform/bridge.js';
import { PutFileError } from '../platform/index.js';
import { createStore, type Store } from '../platform/store.js';

// Intake (asset-board design decision 11): the dropped or picked files are
// hashed, checked against the project, measured, uploaded thumbnail first,
// matched to a scene by their names and added to the document one by one,
// two at a time, matched to a prompt of any category or to a scene
// (image-categories design decision 7). A drop while a batch runs joins it.
// A file whose upload
// failed stays here, outside the document, with Retry, until the page closes.
//
// An intake holds its own reference to the project's document from the
// first file to the last, so a batch the user leaves the board during still
// lands in the document; its result and marks are for the board when it is
// shown again.

export interface Probed {
  width: number | null;
  height: number | null;
  duration: number | null;
  // The thumbnail's bytes, images only; null when the image could not be read.
  thumb: { bytes: Uint8Array; mime: string } | null;
}

export interface IntakeDeps {
  // `browser`: «Uploading n of N»; `desktop`: the files stay on this computer.
  where: 'browser' | 'desktop';
  putFile(projectId: string, sha256: string, bytes: Uint8Array, mime: string): Promise<PutFileResult>;
  hash(bytes: Uint8Array): Promise<string>;
  probe(blob: Blob, kind: FileKind): Promise<Probed>;
  // The project's document, held until release (the sync registry).
  open(projectId: string): Y.Doc;
  release(projectId: string): void;
}

// A file that is not in the project: why, and whether Retry may help.
export interface FailedFile {
  key: number;
  name: string;
  kind: FileKind | null;
  message: string;
  retry: boolean;
}

export interface SceneCount {
  sceneId: string;
  images: number;
  tracks: number;
}

// The images of one PC, NPC or handout, named as it was at the drop.
export interface NamedCount {
  promptId: string;
  category: NamedCategory;
  name: string;
  // Its order in its category, for the result line.
  order: number;
  images: number;
}

export interface IntakeResult {
  added: number;
  matched: number;
  toAssign: number;
  // Per scene, its images (all its prompts) and tracks; in the appendix's
  // order once the batch ends.
  scenes: SceneCount[];
  // Per PC, NPC or handout; by category and order once the batch ends.
  named: NamedCount[];
  alreadyHere: number;
  skipped: number;
  failed: number;
}

export interface IntakeState {
  working: boolean;
  // Files begun and files in the batch, for «Uploading 3 of 14».
  started: number;
  total: number;
  // The last batch's, until the next one or until dismissed.
  result: IntakeResult | null;
  failed: readonly FailedFile[];
  // The files added by the last batch or assigned from the tray since.
  marks: ReadonlySet<string>;
}

const idle: IntakeState = { working: false, started: 0, total: 0, result: null, failed: [], marks: new Set() };

const emptyResult = (): IntakeResult => ({
  added: 0,
  matched: 0,
  toAssign: 0,
  scenes: [],
  named: [],
  alreadyHere: 0,
  skipped: 0,
  failed: 0,
});

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)$/i;

// Step 1: what may be an image or a track, by its type or its extension.
export function kindOf(file: Pick<File, 'name' | 'type'>): FileKind | null {
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
  return null;
}

// The refusals Retry cannot change: too large, not a known type, quota.
const PERMANENT = new Set([413, 415, 507]);

const TOO_LARGE = 'The file is too large.';

// Files to go through, each with the key its failure is kept under and the
// time it is added at.
interface Job {
  file: File;
  key: number;
  at?: string;
}

// The order a batch is added in, whatever order the uploads end in, so the
// takes and the grid's images keep theirs: Suno's «title (1).mp3» after
// «title.mp3», Midjourney's _0 to _3.
function dropKey(name: string): string {
  const suno = parseSuno(name);
  if (suno) return `${suno.title.toLowerCase()}\u0000${String(suno.take ?? 0).padStart(4, '0')}`;
  return name.toLowerCase();
}
const byDropOrder = (a: Job, b: Job) =>
  dropKey(a.file.name).localeCompare(dropKey(b.file.name), undefined, { numeric: true });

export class Intake {
  readonly store: Store<IntakeState> = createStore(idle);
  private queue: Job[] = [];
  private running = 0;
  private doc: Y.Doc | null = null;
  // The hashes of the batch being added, each settled once its file is added
  // or failed: one content dropped twice at once is added once, the second
  // copy waiting for the first and tried itself only if the first failed.
  private inFlight = new Map<string, Promise<void>>();
  private result = emptyResult();
  // The jobs of failed files, for Retry.
  private held = new Map<number, Job>();
  private nextKey = 1;
  // The batch's first moment, and the files dated from it, a millisecond apart.
  private batchAt = 0;
  private batchSeq = 0;
  private disposed = false;
  private readonly onDestroy = () => this.stop();
  // The scenes of the appendix as the board last parsed them.
  private scenes: readonly string[] = [];

  constructor(
    readonly projectId: string,
    private readonly deps: IntakeDeps,
    private readonly parallel = 2,
  ) {}

  get state(): IntakeState {
    return this.store.get();
  }

  // The appendix's scene ids, in order, which files may be matched to.
  setScenes(scenes: readonly string[]): void {
    this.scenes = scenes;
  }

  add(files: readonly File[]): void {
    if (this.disposed || files.length === 0) return;
    this.enqueue(files.map((file) => ({ file, key: this.nextKey++ })));
  }

  retry(key: number): void {
    const failed = this.state.failed.find((f) => f.key === key);
    const job = this.held.get(key);
    if (!failed || !job || this.disposed) return;
    this.held.delete(key);
    this.set({ failed: this.state.failed.filter((f) => f.key !== key) });
    this.enqueue([job]);
  }

  dismiss(key: number): void {
    this.held.delete(key);
    this.set({ failed: this.state.failed.filter((f) => f.key !== key) });
  }

  // The result line's ✕.
  dismissResult(): void {
    this.set({ result: null });
  }

  // A file assigned from the tray is marked new too.
  mark(fileId: string): void {
    this.set({ marks: new Set([...this.state.marks, fileId]) });
  }

  // The board was left: once nothing runs, the marks and the result go.
  left(): void {
    if (!this.state.working) this.set({ result: null, marks: new Set() });
  }

  // The page closes, or the account goes: nothing more is started or added.
  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private set(patch: Partial<IntakeState>): void {
    this.store.set({ ...this.state, ...patch });
  }

  private enqueue(jobs: Job[]): void {
    if (!this.state.working) {
      // A new batch: the last one's result and marks go.
      this.result = emptyResult();
      this.batchAt = Date.now();
      this.batchSeq = 0;
      this.set({ working: true, started: 0, total: 0, result: null, marks: new Set() });
    }
    // Opened again when the last one went while files were in flight: those
    // add nothing, the new ones go to the new document.
    if (!this.doc) {
      this.doc = this.deps.open(this.projectId);
      this.doc.on('destroy', this.onDestroy);
    }
    for (const job of [...jobs].sort(byDropOrder)) {
      job.at = new Date(this.batchAt + this.batchSeq++).toISOString();
      this.queue.push(job);
    }
    this.set({ total: this.state.total + jobs.length });
    while (this.running < this.parallel && this.queue.length > 0) void this.worker();
  }

  private async worker(): Promise<void> {
    this.running += 1;
    try {
      for (let job = this.queue.shift(); job; job = this.queue.shift()) {
        if (!this.doc) break;
        this.set({ started: this.state.started + 1 });
        await this.take(job, this.doc);
      }
    } finally {
      this.running -= 1;
      if (this.running === 0) this.finish();
    }
  }

  private finish(): void {
    if (!this.state.working) return;
    const doc = this.doc;
    this.doc = null;
    this.queue = [];
    this.inFlight.clear();
    if (doc) {
      doc.off('destroy', this.onDestroy);
      this.deps.release(this.projectId);
    }
    // The scenes in the appendix's order.
    const order = (sceneId: string) => {
      const i = this.scenes.indexOf(sceneId);
      return i === -1 ? Infinity : i;
    };
    const scenes = [...this.result.scenes].sort((a, b) => order(a.sceneId) - order(b.sceneId));
    const categories: readonly string[] = ['pc', 'npc', 'handout'];
    const named = [...this.result.named].sort(
      (a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || a.order - b.order,
    );
    this.set({ working: false, result: { ...this.result, scenes, named } });
  }

  // The document went (sign-out) or the page closes: the jobs not begun are
  // dropped, and those in flight add nothing.
  private stop(): void {
    this.queue = [];
    if (this.doc) {
      this.doc.off('destroy', this.onDestroy);
      this.doc = null;
      this.deps.release(this.projectId);
    }
    if (this.state.working && this.running === 0) this.set({ working: false });
  }

  private fail(job: Job, kind: FileKind | null, message: string, retry: boolean): void {
    this.result.failed += 1;
    if (retry) this.held.set(job.key, job);
    this.set({ failed: [...this.state.failed, { key: job.key, name: job.file.name, kind, message, retry }] });
  }

  // Steps 1 to 5 for one file.
  private async take(job: Job, doc: Y.Doc): Promise<void> {
    const { file } = job;
    const guessed = kindOf(file);
    if (!guessed) {
      this.result.skipped += 1;
      return;
    }
    // Read whole only what may be stored: a huge file is never loaded.
    if (file.size > MAX_FILE_BYTES) return this.fail(job, guessed, TOO_LARGE, false);
    let sha: string;
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      sha = await this.deps.hash(bytes);
    } catch {
      return this.fail(job, guessed, 'The file could not be read.', true);
    }
    for (let first = this.inFlight.get(sha); first; first = this.inFlight.get(sha)) await first;
    if (this.doc !== doc) return;
    if (this.listed(doc, sha)) {
      this.result.alreadyHere += 1;
      return;
    }
    const sniffed = sniff(bytes.subarray(0, SNIFF_BYTES));
    if (!sniffed) {
      this.result.skipped += 1;
      return;
    }
    if (bytes.length > FILE_LIMITS[sniffed.kind]) return this.fail(job, sniffed.kind, TOO_LARGE, false);
    let settle!: () => void;
    this.inFlight.set(sha, new Promise((resolve) => (settle = resolve)));
    try {
      // A slice of the file, not a copy of its bytes.
      const probed = await this.deps.probe(file.slice(0, file.size, sniffed.mime), sniffed.kind);
      let thumbSha: string | null = null;
      if (probed.thumb) {
        thumbSha = await this.deps.hash(probed.thumb.bytes);
        await this.deps.putFile(this.projectId, thumbSha, probed.thumb.bytes, probed.thumb.mime);
      }
      if (this.doc !== doc) return;
      const stored = await this.deps.putFile(this.projectId, sha, bytes, sniffed.mime);
      // Left meanwhile (sign-out): the bytes are stored, the entry is not
      // written to a document that is gone.
      if (this.doc !== doc) return;
      this.addEntry(doc, job, sha, thumbSha, sniffed.kind, stored.mime || sniffed.mime, bytes.length, probed);
    } catch (error) {
      if (this.doc !== doc) return;
      const status = error instanceof PutFileError ? error.status : 0;
      const message = error instanceof Error && error.message ? error.message : 'The file could not be stored.';
      this.fail(job, sniffed.kind, message, !PERMANENT.has(status));
    } finally {
      this.inFlight.delete(sha);
      settle();
    }
  }

  private listed(doc: Y.Doc, sha: string): boolean {
    return readFiles(doc).some((f) => f.sha256 === sha);
  }

  // Step 5: matched against the prompts as they are now, added in one
  // transaction. Another tab may have added the same content meanwhile.
  private addEntry(
    doc: Y.Doc,
    job: Job,
    sha256: string,
    thumbSha256: string | null,
    kind: FileKind,
    mime: string,
    size: number,
    probed: Probed,
  ): void {
    const { name } = job.file;
    const match = matchFile(name, kind, targetsOf(doc, this.scenes));
    const entry: NewFile = {
      sha256,
      thumbSha256: kind === 'image' ? thumbSha256 : null,
      name: name.slice(0, 255),
      kind,
      mime,
      size,
      width: kind === 'image' ? probed.width : null,
      height: kind === 'image' ? probed.height : null,
      duration: kind === 'audio' ? probed.duration : null,
      sceneId: 'sceneId' in match ? match.sceneId : null,
      promptId: 'promptId' in match ? match.promptId : null,
      matchedBy: 'matchedBy' in match ? match.matchedBy : null,
      addedBy: 'user',
      ...(job.at ? { addedAt: job.at } : {}),
    };
    let added: FileEntry[];
    try {
      added = addFiles(doc, [entry]).added;
    } catch {
      // The project's cap: the file stays here with the reason.
      this.result.failed += 1;
      this.set({
        failed: [
          ...this.state.failed,
          {
            key: this.nextKey++,
            name,
            kind,
            message: `The project holds ${CAPS.files} images and tracks, the most it can.`,
            retry: false,
          },
        ],
      });
      return;
    }
    if (added.length === 0) {
      this.result.alreadyHere += 1;
      return;
    }
    const file = added[0]!;
    this.result.added += 1;
    if (file.sceneId === null && file.promptId === null) this.result.toAssign += 1;
    else {
      this.result.matched += 1;
      // Counted per scene, whichever of its prompts, or per named prompt.
      const prompt = file.promptId === null ? null : readImagePrompts(doc).find((p) => p.id === file.promptId);
      const sceneId = file.sceneId ?? prompt?.sceneId ?? null;
      if (sceneId !== null) {
        let scene = this.result.scenes.find((s) => s.sceneId === sceneId);
        if (!scene) this.result.scenes.push((scene = { sceneId, images: 0, tracks: 0 }));
        if (file.kind === 'image') scene.images += 1;
        else scene.tracks += 1;
      } else if (prompt && prompt.category !== 'scene') {
        let named = this.result.named.find((n) => n.promptId === prompt.id);
        if (!named) {
          named = { promptId: prompt.id, category: prompt.category, name: prompt.name ?? '', order: prompt.order, images: 0 };
          this.result.named.push(named);
        }
        named.images += 1;
      }
    }
    this.set({ marks: new Set([...this.state.marks, file.id]) });
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// One place of the result line: «S3: 4 images, 2 tracks», «NPCs · Padre
// Anselmo: 4 images»; its label links to its tab.
export interface ResultPlace {
  // Its scene or prompt id.
  key: string;
  label: string;
  counts: string;
  sceneId: string | null;
  category: 'scene' | NamedCategory;
}

// The result line (screen 5): the bold part, the places, then the rest.
export function resultLine(result: IntakeResult): { head: string; places: ResultPlace[]; rest: string } {
  const head =
    result.added > 0
      ? `${plural(result.added, 'file', 'files')} added: ${result.matched} matched, ${result.toAssign} to assign.`
      : 'No files added.';
  const places: ResultPlace[] = [
    ...result.scenes.map((s) => ({
      key: s.sceneId,
      label: s.sceneId,
      counts: [
        ...(s.images ? [plural(s.images, 'image', 'images')] : []),
        ...(s.tracks ? [plural(s.tracks, 'track', 'tracks')] : []),
      ].join(', '),
      sceneId: s.sceneId,
      category: 'scene' as const,
    })),
    ...result.named.map((n) => ({
      key: n.promptId,
      label: `${categoryText[n.category].tab} · ${n.name || newName(n.category)}`,
      counts: plural(n.images, 'image', 'images'),
      sceneId: null,
      category: n.category,
    })),
  ];
  const parts: string[] = [];
  if (result.added > 0) parts.push('New files are marked.');
  if (result.alreadyHere > 0) parts.push(`${result.alreadyHere} already here.`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped: not an image or a track.`);
  if (result.failed > 0) parts.push(`${result.failed} not added.`);
  return { head, places, rest: parts.join(' ') };
}

// The places as plain text: «S3: 4 images · NPCs · Padre Anselmo: 4 images.».
export const placesText = (places: readonly ResultPlace[]): string =>
  places.length === 0 ? '' : `${places.map((p) => `${p.label}: ${p.counts}`).join(' · ')}.`;

// «Uploading 3 of 14» in the browser; on the desktop the files are stored on
// this computer first.
export const progressLine = (state: IntakeState, where: IntakeDeps['where']): string =>
  `${where === 'browser' ? 'Uploading' : 'Adding'} ${Math.max(1, state.started)} of ${state.total}`;
