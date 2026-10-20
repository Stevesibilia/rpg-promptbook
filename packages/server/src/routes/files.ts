import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FILE_LIMITS, isSha256, MAX_FILE_BYTES, sniff, SNIFF_BYTES, type Sniffed } from 'promptbook-project';
import { requireSession } from '../accounts/auth.js';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { HashMismatch, Incomplete, TooLarge, type BlobStore } from '../files/blobs.js';
import { fitsQuota, linkedFile, linkFile, quotaReached } from '../files/store.js';
import { getProject } from '../projects.js';
import { NOT_FOUND } from './projects.js';

// Images and tracks (asset-board design decision 5): uploaded raw, named by
// their SHA-256, and served only to the owner of a project that links them.

const GIB = 1024 ** 3;

const tooLarge = () => new AppError(413, 'file_too_large', 'The file is too large.');

interface Params {
  id: string;
  sha256: string;
}

function params(req: FastifyRequest): Params {
  const { id, sha256 } = req.params as Params;
  if (!isSha256(sha256)) throw new AppError(400, 'validation_error', 'sha256: must be 64 lower-case hex digits');
  return { id, sha256 };
}

// The user's project, not in the bin.
async function ownProject(db: Db, req: FastifyRequest, id: string): Promise<{ userId: string }> {
  const { user } = requireSession(req);
  const project = await getProject(db, user.id, id);
  if (!project || project.deletedAt) throw NOT_FOUND();
  return { userId: user.id };
}

// The request's declared length: required, a whole number, and within the
// largest file of any kind.
function contentLength(req: FastifyRequest): number {
  const header = req.headers['content-length'];
  if (header === undefined || !/^\d+$/.test(header)) {
    throw new AppError(411, 'length_required', 'The upload needs a Content-Length.');
  }
  const length = Number(header);
  if (length > MAX_FILE_BYTES) throw tooLarge();
  return length;
}

// The first bytes of the body and an iterator over the rest, without ever
// destroying the request: whatever happens, it is still answered.
async function readHead(req: FastifyRequest): Promise<{ head: Buffer; rest: AsyncIterator<Buffer> }> {
  const rest = req.raw.iterator({ destroyOnReturn: false }) as AsyncIterator<Buffer>;
  const chunks: Buffer[] = [];
  let length = 0;
  while (length < SNIFF_BYTES) {
    const next = await rest.next();
    if (next.done) break;
    chunks.push(next.value);
    length += next.value.length;
  }
  return { head: Buffer.concat(chunks), rest };
}

// The head again, then the rest, as one stream for the blob store.
function rejoin(head: Buffer, rest: AsyncIterator<Buffer>): Readable {
  return Readable.from(
    (async function* () {
      if (head.length > 0) yield head;
      for (;;) {
        const next = await rest.next();
        if (next.done) return;
        yield next.value;
      }
    })(),
    { objectMode: false },
  );
}

// "bytes=a-b", "bytes=a-" or "bytes=-n", inclusive. Null for anything else,
// which is answered with the whole file; 'unsatisfiable' for a range outside it.
function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const match = header === undefined ? null : /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  // A last byte before the first makes the header invalid, so it is ignored.
  if (match[2] !== '' && Number(match[2]) < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end };
}

export async function filesRoutes(
  app: FastifyInstance,
  { config, db, blobs }: { config: Config; db: Db; blobs: BlobStore },
) {
  // The body is the handler's to stream, never buffered: no parser in this
  // scope reads it, whatever its type, so the 1 MB body limit never applies.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', (_req, _payload, done) => done(null));

  const quotaBytes = config.filesQuotaGb * GIB;

  // A refusal that leaves a body unread, of unknown or refused length, ends
  // the connection: Node would otherwise read all of it to keep the
  // connection alive. A body whose head was read and whose length is within
  // the limits is drained instead (`drained`), so the client gets its answer.
  const drained = new WeakSet<FastifyRequest>();
  app.addHook('onSend', async (req, reply) => {
    if (req.method === 'PUT' && reply.statusCode >= 400 && !req.raw.complete && !drained.has(req)) {
      reply.header('connection', 'close');
    }
  });

  app.put('/api/projects/:id/files/:sha256', async (req, reply) => {
    const { id, sha256 } = params(req);
    const { userId } = await ownProject(db, req, id);
    const length = contentLength(req);
    const linked = await linkedFile(db, id, sha256);
    // A retry, or a file the project still links: the body is not read.
    // Bytes lost from the disk are uploaded again below.
    if (linked && (await blobs.has(sha256))) return reply.code(200).send(linked);
    // Knowing a hash never grants a file: another project's or user's copy is
    // read and hashed below like a new one.
    if (!(await fitsQuota(db, userId, sha256, length, quotaBytes))) throw quotaReached();
    const { head, rest } = await readHead(req);
    try {
      const type: Sniffed | null = sniff(head);
      if (!type) {
        throw new AppError(415, 'unsupported_type', 'Only PNG, JPEG and WebP images and MP3, M4A, AAC, WAV, Ogg and FLAC tracks.');
      }
      if (length > FILE_LIMITS[type.kind]) throw tooLarge();
      try {
        await blobs.put(sha256, rejoin(head, rest), { maxBytes: length, size: length });
      } catch (error) {
        if (error instanceof TooLarge) throw tooLarge();
        if (error instanceof HashMismatch) throw new AppError(400, 'hash_mismatch', error.message);
        if (error instanceof Incomplete) throw new AppError(400, 'validation_error', error.message);
        throw error;
      }
      const stored = { sha256, size: length, mime: type.mime };
      await linkFile(db, blobs, id, stored, { userId, quotaBytes });
      return reply.code(201).send(stored);
    } catch (error) {
      // The rest of the body, at most the 80 MB of its declared length, is
      // read and thrown away.
      drained.add(req);
      await rest.return?.();
      req.raw.resume();
      throw error;
    }
  });

  // GET and HEAD in one route: HEAD answers the same headers without opening
  // the file, where Fastify's own HEAD route would read it to the end.
  app.route({
    method: ['GET', 'HEAD'],
    url: '/api/projects/:id/files/:sha256',
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const { id, sha256 } = params(req);
      await ownProject(db, req, id);
      const file = await linkedFile(db, id, sha256);
      // Linked but not on disk (a lost volume, design.md Risks): not found, so
      // a client that still has the file uploads it again.
      if (!file || !(await blobs.has(sha256))) throw NOT_FOUND();
      const range = parseRange(req.headers.range, file.size);
      const headers = {
        'accept-ranges': 'bytes',
        etag: `"${sha256}"`,
        'cache-control': 'private, max-age=31536000, immutable',
        'content-disposition': 'inline',
        'content-type': file.mime,
      };
      if (range === 'unsatisfiable') {
        return reply.code(416).headers({ ...headers, 'content-range': `bytes */${file.size}` }).send();
      }
      // Opened before the headers are set, so a file that went missing since
      // is answered as not found rather than with its headers.
      const blob = req.method === 'HEAD' ? null : await blobs.get(sha256, range ?? undefined);
      if (req.method !== 'HEAD' && !blob) throw NOT_FOUND();
      if (range) reply.code(206).header('content-range', `bytes ${range.start}-${range.end}/${file.size}`);
      reply.headers({ ...headers, 'content-length': range ? range.end - range.start + 1 : file.size });
      return reply.send(blob?.stream);
    },
  });
}
