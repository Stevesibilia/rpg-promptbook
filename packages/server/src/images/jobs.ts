import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyBaseLogger } from 'fastify';
import {
  addFiles,
  FILE_LIMITS,
  finishGenerationJob,
  IMAGE_MODELS,
  migrateImagePrompts,
  readFiles,
  recordGenerationProgress,
  sentPrompt,
  sniff,
  type ImageModelKey,
  type ImageProvider,
  type ImageShape,
  type NewFile,
} from 'promptbook-project';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { BlobStore } from '../files/blobs.js';
import { imageDimensions } from '../files/dimensions.js';
import { linkFile } from '../files/store.js';
import { withLiveDocument } from '../live.js';
import { getProject } from '../projects.js';
import type { Sync } from '../sync.js';
import {
  ATELIER_ERRORS,
  AtelierError,
  downloadImage,
  ensureCollection,
  readGeneration,
  startGeneration,
  type AtelierImage,
  type GenerationState,
} from './atelier.js';
import { generateImage, IMAGE_ERRORS } from './openrouter.js';

// One generation job (board-image-generation design decision 9): `count`
// OpenRouter calls at once, each image stored, linked, measured and added to
// the board in its own short write as it lands, so every device sees it
// arrive. No live document is held open across an OpenRouter call. The job
// holds the plain key in memory only; nothing here logs it.
//
// Through Atelier (atelier-image-provider design decision 10): one Atelier
// generation of `count` images into the project's collection, watched until
// it ends; each new image is downloaded and lands on the board the same way.

export interface JobDeps {
  db: Db;
  sync: Sync;
  blobs: BlobStore;
  baseUrl: string;
  quotaBytes: number;
  log: FastifyBaseLogger;
  // Each call's timeout; 180 s unless a test sets a shorter one.
  timeoutMs?: number | undefined;
  // Only for the tests: how often an Atelier generation is asked about, 2 s
  // otherwise, and how long it is watched, 10 minutes otherwise.
  atelierPollMs?: number | undefined;
  atelierWatchMs?: number | undefined;
}

export interface GenerationRun {
  jobId: string;
  projectId: string;
  userId: string;
  promptId: string;
  // The prompt's text when the job started.
  prompt: string;
  // The file names' start: S2-p1, padre-anselmo.
  label: string;
  model: ImageModelKey;
  count: number;
  shape: ImageShape;
  // The service, and its credential: the OpenRouter key or the Atelier token.
  provider: ImageProvider;
  key: string;
  // Through Atelier: the server's ATELIER_URL, and the project's title when
  // the job started, which names its collection (D7).
  atelierUrl?: string | null;
  projectTitle?: string;
  // Aborted when the key is removed or the server stops; its reason, a
  // string, is the sentence of the images it stops.
  stop: AbortSignal;
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// A failed image is `billed` when OpenRouter reported a cost for it.
type Outcome = { ok: true } | { ok: false; error: string; billed: boolean };

// A failed image's sentence, raised inside the steps below.
class ImageFailed extends Error {}

const BINNED = 'The project was moved to the bin.';

// D10's sentences for Atelier.
export const ATELIER_JOB_ERRORS = {
  noImage: 'Atelier sent no image. Try again.',
  tokenRemoved: 'The Atelier token was removed.',
  timedOut: 'Atelier did not finish in time. The images may still arrive in Atelier.',
  fewer: 'Atelier sent fewer images than asked.',
} as const;

// The codes Promptbook gives a call that got no answer Atelier wrote itself.
const NOT_ATELIERS_OWN = new Set(['atelier_unreachable', 'atelier_bad_answer', 'atelier_refused']);

// An error answered by Atelier itself, «{error, message}»: shown as «Atelier
// refused: <its message>», so the reader knows which app speaks (D10, step
// 1). «This …» reads on with a small letter. Null for any other failure.
export function atelierRefused(error: unknown): string | null {
  if (!(error instanceof AtelierError) || NOT_ATELIERS_OWN.has(error.code)) return null;
  const message = error.message.startsWith('This ') ? `t${error.message.slice(1)}` : error.message;
  return `Atelier refused: ${message}`;
}

const POLL_MS = 2_000;
const WATCH_MS = 10 * 60 * 1000;
// Polls in a row without an answer that end the watch (D10, step 5).
const MAX_MISSED_POLLS = 3;
// Atelier's limit on a collection's name (D7).
const COLLECTION_NAME_MAX = 60;

// The project's collection name: its title, trimmed, at most 60 UTF-16 units
// and never half a character; "Promptbook project" when empty.
export function collectionName(title: string): string {
  let name = '';
  for (const char of title.trim()) {
    if (name.length + char.length > COLLECTION_NAME_MAX) break;
    name += char;
  }
  return name.trim() || 'Promptbook project';
}

// Waits, or less when the signal fires.
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });

// What land() writes on the entry beside the model and cost.
interface LandExtra {
  generatedVia: ImageProvider;
  atelierImageId?: string;
}

export async function runGenerationJob(deps: JobDeps, run: GenerationRun): Promise<void> {
  const { db, sync, log } = deps;
  const text = sentPrompt(run.prompt).text;
  // The project is the user's and not in the bin: else nothing is written to
  // its document any more.
  const writable = async () => {
    const project = await getProject(db, run.userId, run.projectId);
    return project !== null && project.deletedAt === null;
  };
  const write = async <T>(fn: Parameters<typeof withLiveDocument<T>>[3]): Promise<T | null> =>
    (await writable()) ? withLiveDocument(sync, run.projectId, run.userId, fn) : null;

  const row = (ok: boolean, fields: { cost?: number | null; sha256?: string | null; error?: string | null }) =>
    db.query(
      `insert into image_generations (user_id, project_id, prompt_id, model, cost, sha256, ok, error, provider)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        run.userId,
        run.projectId,
        run.promptId,
        run.model,
        fields.cost ?? null,
        fields.sha256 ?? null,
        ok,
        fields.error ?? null,
        run.provider,
      ],
    );

  async function store(bytes: Buffer, mime: string, sha256: string): Promise<void> {
    const file = { sha256, size: bytes.length, mime };
    for (let attempt = 0; ; attempt++) {
      await deps.blobs.put(sha256, Readable.from([bytes]), { maxBytes: bytes.length, size: bytes.length });
      try {
        await linkFile(db, deps.blobs, run.projectId, file, { userId: run.userId, quotaBytes: deps.quotaBytes });
        return;
      } catch (error) {
        if (error instanceof AppError && error.code === 'quota') throw new ImageFailed(IMAGE_ERRORS.quota);
        // The sweep removed the bytes between the put and the link: once more.
        if (error instanceof AppError && error.code === 'retry' && attempt === 0) continue;
        throw error;
      }
    }
  }

  // D10: what follows the bytes, on both paths. Checks them, stores them,
  // links them and adds the image to the board, counted on the job. Throws
  // ImageFailed with the image's sentence, or anything else on a failure of
  // ours. Answers the image's sha256.
  async function land(bytes: Buffer, cost: number | null, extra: LandExtra): Promise<string> {
    const noImage = run.provider === 'atelier' ? ATELIER_JOB_ERRORS.noImage : IMAGE_ERRORS.noImage;
    const type = sniff(bytes.subarray(0, 12));
    if (!type || type.kind !== 'image' || !EXTENSIONS[type.mime]) throw new ImageFailed(noImage);
    if (bytes.length > FILE_LIMITS.image) throw new ImageFailed(noImage);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    // Nothing is linked to a project moved to the bin meanwhile.
    if (!(await writable())) throw new ImageFailed(BINNED);
    await store(bytes, type.mime, sha256);
    const size = imageDimensions(bytes, type.mime);
    const added = await write((doc) => {
      migrateImagePrompts(doc);
      const n = readFiles(doc).filter((f) => f.kind === 'image' && f.promptId === run.promptId).length + 1;
      const entry: NewFile = {
        sha256,
        thumbSha256: null,
        name: `${run.label}-${run.model}-${n}.${EXTENSIONS[type.mime]}`,
        kind: 'image',
        mime: type.mime,
        size: bytes.length,
        width: size?.width ?? null,
        height: size?.height ?? null,
        duration: null,
        sceneId: null,
        promptId: run.promptId,
        matchedBy: 'generated',
        addedBy: 'user',
        generatedModel: run.model,
        cost,
        generatedVia: extra.generatedVia,
        ...(extra.atelierImageId !== undefined ? { atelierImageId: extra.atelierImageId } : {}),
      };
      let skipped: number;
      try {
        skipped = addFiles(doc, [entry]).skipped.length;
      } catch (error) {
        // The project's cap on files.
        if (error instanceof Error && error.message.startsWith('files: at most')) {
          throw new ImageFailed(IMAGE_ERRORS.boardFull);
        }
        throw error;
      }
      recordGenerationProgress(doc, run.jobId, 'done');
      return { skipped };
    });
    if (added === null) throw new ImageFailed(BINNED);
    // The same bytes are on the board already: billed, and nothing new.
    if (added.skipped > 0) log.warn({ jobId: run.jobId, cost }, 'A generated image was already on the board');
    return sha256;
  }

  // A failed image: its row, with the cost reported for it, and its count on
  // the job. `mayBeBilled`: no cost is known yet, but one may still come.
  async function failImage(sentence: string, cost: number | null, mayBeBilled = false): Promise<Outcome> {
    await row(false, { cost, error: sentence }).catch((e: unknown) => log.error({ jobId: run.jobId, err: e }, 'Could not record a failed image'));
    await write((doc) => recordGenerationProgress(doc, run.jobId, 'failed')).catch((e: unknown) =>
      log.error({ jobId: run.jobId, err: e }, 'Could not record a failed image on the board'),
    );
    return { ok: false, error: sentence, billed: cost !== null || mayBeBilled };
  }

  async function one(): Promise<Outcome> {
    let cost: number | null = null;
    let sha256 = '';
    try {
      const answer = await generateImage(
        deps.baseUrl,
        run.key,
        { model: IMAGE_MODELS[run.model].id, prompt: text, aspectRatio: run.shape },
        deps.timeoutMs,
        run.stop,
      );
      if (!answer.ok) throw new ImageFailed(answer.error);
      cost = answer.cost;
      sha256 = await land(answer.bytes, cost, { generatedVia: 'openrouter' });
    } catch (error) {
      const sentence = error instanceof ImageFailed ? error.message : IMAGE_ERRORS.noAnswer;
      if (!(error instanceof ImageFailed)) log.error({ jobId: run.jobId, err: error }, 'An image of a generation job failed');
      // A failed image keeps the cost OpenRouter reported for it (D10): it
      // was billed, then refused on our side.
      if (cost !== null) log.warn({ jobId: run.jobId, cost }, 'An image OpenRouter billed did not land on the board');
      return failImage(sentence, cost);
    }
    // Its own step: a failed insert here must not count the image twice.
    await row(true, { cost, sha256 }).catch((e: unknown) =>
      log.error({ jobId: run.jobId, err: e, cost }, 'Could not record a generated image'),
    );
    return { ok: true };
  }

  const stopReason = () => (typeof run.stop.reason === 'string' ? run.stop.reason : ATELIER_ERRORS.unreachable);

  // One Atelier image: downloaded, then landed like an OpenRouter one.
  async function fromAtelier(image: AtelierImage): Promise<Outcome> {
    let sha256: string;
    try {
      const bytes = await downloadImage(run.atelierUrl!, run.key, image.id, { signal: run.stop });
      sha256 = await land(bytes, image.costUsd, { generatedVia: 'atelier', atelierImageId: image.id });
    } catch (error) {
      const sentence =
        error instanceof ImageFailed
          ? error.message
          : run.stop.aborted
            ? stopReason()
            : error instanceof AtelierError
              ? (atelierRefused(error) ?? error.message)
              : ATELIER_ERRORS.unreachable;
      if (!(error instanceof ImageFailed) && !(error instanceof AtelierError)) {
        log.error({ jobId: run.jobId, err: error }, 'An image of a generation job failed');
      }
      if (image.costUsd !== null) log.warn({ jobId: run.jobId, cost: image.costUsd }, 'An image Atelier billed did not land on the board');
      return failImage(sentence, image.costUsd);
    }
    await row(true, { cost: image.costUsd, sha256 }).catch((e: unknown) =>
      log.error({ jobId: run.jobId, err: e, cost: image.costUsd }, 'Could not record a generated image'),
    );
    return { ok: true };
  }

  // D7: the project's collection, made on the first Generate and kept per
  // account and project.
  async function collection(fresh: boolean): Promise<string> {
    if (!fresh) {
      const stored = await db.queryOne<{ collection_id: string }>(
        'select collection_id from atelier_collections where user_id = $1 and project_id = $2',
        [run.userId, run.projectId],
      );
      if (stored) return stored.collection_id;
    }
    const id = await ensureCollection(run.atelierUrl!, run.key, collectionName(run.projectTitle ?? ''), { signal: run.stop });
    await db.query(
      `insert into atelier_collections (user_id, project_id, collection_id) values ($1, $2, $3)
       on conflict (user_id, project_id) do update set collection_id = excluded.collection_id`,
      [run.userId, run.projectId, id],
    );
    return id;
  }

  // D10, step 1: the generation started; a collection Atelier no longer has
  // is made again, once.
  async function start(): Promise<string> {
    const body = (collectionId: string) => ({
      prompt: text,
      model: IMAGE_MODELS[run.model].id,
      aspectRatio: run.shape,
      count: run.count,
      collectionId,
    });
    try {
      return (await startGeneration(run.atelierUrl!, run.key, body(await collection(false)), { signal: run.stop })).id;
    } catch (error) {
      if (!(error instanceof AtelierError) || error.status !== 400 || error.field !== 'collectionId') throw error;
    }
    await db.query('delete from atelier_collections where user_id = $1 and project_id = $2', [run.userId, run.projectId]);
    return (await startGeneration(run.atelierUrl!, run.key, body(await collection(true)), { signal: run.stop })).id;
  }

  async function viaAtelier(): Promise<Outcome[]> {
    let generationId: string;
    try {
      generationId = await start();
    } catch (error) {
      // Nothing started: every image fails with Atelier's sentence.
      const sentence = run.stop.aborted
        ? stopReason()
        : error instanceof AtelierError
          ? (atelierRefused(error) ?? error.message)
          : ATELIER_ERRORS.unreachable;
      if (!(error instanceof AtelierError)) log.error({ jobId: run.jobId, err: error }, 'An Atelier generation did not start');
      const outcomes: Outcome[] = [];
      for (let i = 0; i < run.count; i++) outcomes.push(await failImage(sentence, null));
      return outcomes;
    }

    // D10, steps 2 and 5: watched until it ends, the stop, no answer three
    // times in a row, or the time is up.
    const outcomes: Outcome[] = [];
    const seen = new Set<string>();
    const deadline = Date.now() + (deps.atelierWatchMs ?? WATCH_MS);
    let state: GenerationState | null = null;
    let ended: string | null = null;
    let missed = 0;
    for (;;) {
      if (run.stop.aborted) {
        ended = stopReason();
        break;
      }
      try {
        state = await readGeneration(run.atelierUrl!, run.key, generationId, { signal: run.stop });
        missed = 0;
      } catch (error) {
        if (run.stop.aborted) {
          ended = stopReason();
          break;
        }
        log.warn({ jobId: run.jobId, err: error }, 'Atelier did not answer about a generation');
        if (++missed >= MAX_MISSED_POLLS) {
          // The last poll's error, when Atelier answered it itself.
          ended = atelierRefused(error) ?? ATELIER_ERRORS.unreachable;
          break;
        }
      }
      for (const image of state?.images ?? []) {
        if (seen.has(image.id) || outcomes.length >= run.count) continue;
        seen.add(image.id);
        outcomes.push(await fromAtelier(image));
      }
      if (state !== null && state.status !== 'running') break;
      if (Date.now() >= deadline) {
        ended = ATELIER_JOB_ERRORS.timedOut;
        break;
      }
      await pause(deps.atelierPollMs ?? POLL_MS, run.stop);
    }

    // D10, steps 3 and 4: every image still missing fails with the reason;
    // what Atelier billed beyond its images goes on the first of them. A
    // watch that ended before Atelier did (the stop, the time, no answer)
    // leaves a generation that may still bill its images: the job's sentence
    // then never says that nothing was charged.
    const reasons = [...(state?.failures ?? [])];
    const billed = state?.images.reduce((sum, image) => sum + (image.costUsd ?? 0), 0) ?? 0;
    const extra = state?.costUsd != null ? Math.round((state.costUsd - billed) * 1e6) / 1e6 : 0;
    let leftover = extra > 0 ? extra : null;
    while (outcomes.length < run.count) {
      const sentence = ended ?? reasons.shift() ?? state?.error ?? ATELIER_JOB_ERRORS.fewer;
      outcomes.push(await failImage(sentence, leftover, ended !== null));
      leftover = null;
    }
    if (leftover !== null) log.warn({ jobId: run.jobId, cost: leftover }, 'Atelier billed more than its images, with no failed image to carry it');
    return outcomes;
  }

  // The first image to fail gives the sentence.
  let first: string | null = null;
  const outcomes =
    run.provider === 'atelier'
      ? await viaAtelier()
      : await Promise.all(
          Array.from({ length: run.count }, () =>
            one().then((outcome) => {
              if (!outcome.ok) first ??= outcome.error;
              return outcome;
            }),
          ),
        );
  if (run.provider === 'atelier') first = outcomes.find((o): o is Extract<Outcome, { ok: false }> => !o.ok)?.error ?? null;
  const failed = outcomes.filter((o) => !o.ok).length;
  const done = run.count - failed;
  // No image landed and the provider billed none of them (D10).
  const charged = outcomes.some((o) => !o.ok && o.billed);
  const error =
    failed === 0
      ? null
      : done > 0
        ? `${failed} of ${run.count} images failed: ${first!}`
        : charged
          ? first!
          : `${first!} Nothing was charged.`;
  await write((doc) => finishGenerationJob(doc, run.jobId, error)).catch((e: unknown) =>
    log.error({ jobId: run.jobId, err: e }, 'Could not finish a generation job'),
  );
}
