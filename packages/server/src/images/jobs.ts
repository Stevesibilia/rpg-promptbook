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
import { generateImage, IMAGE_ERRORS } from './openrouter.js';

// One generation job (board-image-generation design decision 9): `count`
// OpenRouter calls at once, each image stored, linked, measured and added to
// the board in its own short write as it lands, so every device sees it
// arrive. No live document is held open across an OpenRouter call. The job
// holds the plain key in memory only; nothing here logs it.

export interface JobDeps {
  db: Db;
  sync: Sync;
  blobs: BlobStore;
  baseUrl: string;
  quotaBytes: number;
  log: FastifyBaseLogger;
  // Each call's timeout; 180 s unless a test sets a shorter one.
  timeoutMs?: number | undefined;
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
  key: string;
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
      `insert into image_generations (user_id, project_id, prompt_id, model, cost, sha256, ok, error)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [run.userId, run.projectId, run.promptId, run.model, fields.cost ?? null, fields.sha256 ?? null, ok, fields.error ?? null],
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
      const { bytes } = answer;
      const type = sniff(bytes.subarray(0, 12));
      if (!type || type.kind !== 'image' || !EXTENSIONS[type.mime]) throw new ImageFailed(IMAGE_ERRORS.noImage);
      if (bytes.length > FILE_LIMITS.image) throw new ImageFailed(IMAGE_ERRORS.noImage);
      sha256 = createHash('sha256').update(bytes).digest('hex');
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
    } catch (error) {
      const sentence = error instanceof ImageFailed ? error.message : IMAGE_ERRORS.noAnswer;
      if (!(error instanceof ImageFailed)) log.error({ jobId: run.jobId, err: error }, 'An image of a generation job failed');
      // A failed image keeps the cost OpenRouter reported for it (D10): it
      // was billed, then refused on our side.
      if (cost !== null) log.warn({ jobId: run.jobId, cost }, 'An image OpenRouter billed did not land on the board');
      await row(false, { cost, error: sentence }).catch((e: unknown) => log.error({ jobId: run.jobId, err: e }, 'Could not record a failed image'));
      await write((doc) => recordGenerationProgress(doc, run.jobId, 'failed')).catch((e: unknown) =>
        log.error({ jobId: run.jobId, err: e }, 'Could not record a failed image on the board'),
      );
      return { ok: false, error: sentence, billed: cost !== null };
    }
    // Its own step: a failed insert here must not count the image twice.
    await row(true, { cost, sha256 }).catch((e: unknown) =>
      log.error({ jobId: run.jobId, err: e, cost }, 'Could not record a generated image'),
    );
    return { ok: true };
  }

  // The first image to fail gives the sentence.
  let first: string | null = null;
  const outcomes = await Promise.all(
    Array.from({ length: run.count }, () =>
      one().then((outcome) => {
        if (!outcome.ok) first ??= outcome.error;
        return outcome;
      }),
    ),
  );
  const failed = outcomes.filter((o) => !o.ok).length;
  const done = run.count - failed;
  // No image landed and OpenRouter billed none of them (D10).
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
