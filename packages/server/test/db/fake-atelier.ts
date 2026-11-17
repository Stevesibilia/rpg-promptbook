import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crc32, deflateSync } from 'node:zlib';

// A fake Atelier for the tests, the end-to-end stack and the owner's preview
// (atelier-image-provider design decision 15), shaped like Atelier's
// /api/v1 as its v0.8.0 plan describes it (contract D1). Built-ins only and
// erasable TypeScript only, so Node runs it with its types stripped.
//
// Tokens, as bearer tokens:
//   atl_pat_good   write, named "promptbook", expires 2027-11-12
//   atl_pat_read   read only, named "gallery", never expires
//   anything else  401 invalid_token
//
// A generation makes its images one by one, `delay` ms apart: small PNGs,
// each with bytes of its own, $0.08 for GPT Image and $0.037 for Nano Banana.
//
// Reference images (reference-images design decision 22): POST /uploads
// takes a raw PNG, JPEG or WebP of at most 20 MB and answers the image, the
// one already there for the same bytes; a generation's referenceIds must be
// known image ids, at most 4, and are echoed. For the tests only, without a
// token: GET /api/v1/__last answers {"referenceIds": [...], "uploads": n},
// the ids of the last POST /generations and the uploads since the start;
// DELETE /api/v1/__images/<id> forgets an image, as one deleted in Atelier.
// Keep e2e/atelier/serve.mjs, its copy, in step.

export interface FakeAtelierCall {
  method: string;
  path: string;
  // The parsed JSON body; null when none or not JSON.
  body: unknown;
  // Whether the request carried a bearer token. The token itself is never
  // recorded.
  bearer: boolean;
}

export interface FakeAtelierOptions {
  host?: string;
  port?: number;
  // The time between two images of a generation.
  delayMs?: number;
}

export interface FakeCollection {
  id: string;
  name: string;
  imageIds: string[];
}

export interface FakeGeneration {
  id: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  count: number;
  collectionId: string;
  referenceIds: string[];
  status: 'running' | 'done' | 'partial' | 'failed';
  error: string | null;
  images: { id: string; costUsd: number; mime: string }[];
  failures: string[];
  // What the failed images cost, counted in the generation's costUsd only.
  failedCost: number;
}

export interface FakeAtelier {
  // Atelier's address, as ATELIER_URL: no /api/v1.
  url: string;
  calls: FakeAtelierCall[];
  collections: FakeCollection[];
  generations: FakeGeneration[];
  setDelay(ms: number): void;
  // The next n images fail into failures[] with this reason, each costing
  // `costUsd` (0 by default).
  failNext(n: number, reason?: string, costUsd?: number): void;
  // The next start answers 409 cap_reached.
  capReached(): void;
  // A collection removed in Atelier.
  dropCollection(id: string): void;
  // The next call answers this status and body instead; a string body is
  // sent as it is.
  answerNext(status: number, body: unknown): void;
  // An image already in Atelier, made outside Promptbook
  // (connector-board-images design decision 15): served at
  // /api/v1/images/<id>/file like a generated one. Answers its id.
  addImage(bytes: Buffer, mime?: string): string;
  // An image deleted in Atelier: its id is unknown from now on.
  deleteImage(id: string): void;
  // The referenceIds of the last POST /generations; [] before any.
  lastReferenceIds(): string[];
  // How many POST /uploads were answered with an image.
  uploads(): number;
  close(): Promise<void>;
}

export const FAKE_ATELIER_TOKENS = { good: 'atl_pat_good', read: 'atl_pat_read' } as const;

// Atelier's sentences (measured on 2026-11-12).
export const ATELIER_SENTENCES = {
  capReached: 'This would pass your monthly cap of $20.00 ($19.96 spent). Raise the cap in Settings or wait for next month.',
  tooManyRunning: 'Three generations are already running. Wait for one to finish.',
  noCollection: 'Choose a collection that exists.',
  invalidToken: 'The API token is missing, unknown, revoked or expired.',
  referenceNotFound: 'A reference image was not found. Remove it and try again.',
  wrongType: 'Only PNG, JPEG or WebP images can be references.',
  tooLarge: 'A reference image can be at most 20 MB.',
} as const;

const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCES = 4;

const MODELS: Record<string, { name: string; estCostUsd: number; costUsd: number }> = {
  'openai/gpt-image-2.6-sunburst': { name: 'GPT Image 2.6 Sunburst', estCostUsd: 0.083, costUsd: 0.08 },
  'google/gemini-nano-banana-2.1': { name: 'Nano Banana 2.1', estCostUsd: 0.037, costUsd: 0.037 },
};

const SIZES: Record<string, [number, number]> = {
  '16:9': [160, 90],
  '3:2': [150, 100],
  '1:1': [120, 120],
  '2:3': [100, 150],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Different in every process, so a restarted fake never sends the bytes it
// sent before: the board would skip them as already listed.
const RUN = randomUUID();

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// A picture in one colour per image, a band of another across it.
function png(width: number, height: number, n: number): Buffer {
  const [r, g, b] = [(n * 71) % 256, (n * 113) % 256, (n * 167) % 256];
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const band = x > width / 3 && x < (2 * width) / 3;
      row[1 + x * 3] = band ? 255 - r : r;
      row[2 + x * 3] = band ? 255 - g : g;
      row[3 + x * 3] = band ? 255 - b : b;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('tEXt', Buffer.from(`Comment\0fake atelier ${RUN} image ${n}`, 'latin1')),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

const failure = (res: ServerResponse, status: number, error: string, message: string, field?: string) =>
  send(res, status, field === undefined ? { error, message } : { error, message, field });

function bearerOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

async function readRaw(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function parse(raw: Buffer): unknown {
  if (raw.length === 0) return null;
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const round = (value: number) => Math.round(value * 1e6) / 1e6;

export async function startFakeAtelier(options: FakeAtelierOptions = {}): Promise<FakeAtelier> {
  const calls: FakeAtelierCall[] = [];
  const collections: FakeCollection[] = [];
  const generations: FakeGeneration[] = [];
  const files = new Map<string, { bytes: Buffer; mime: string }>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let delay = options.delayMs ?? 5;
  let failing: { left: number; reason: string; costUsd: number } = { left: 0, reason: '', costUsd: 0 };
  let capped = false;
  let next: { status: number; body: unknown } | null = null;
  let made = 0;
  let lastReferenceIds: string[] = [];
  let uploads = 0;
  // This month's spend before the tests' images, as GET /spend answers it.
  let spent = 4.12;

  const later = (ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };

  const generationJson = (g: FakeGeneration) => ({
    id: g.id,
    prompt: g.prompt,
    model: g.model,
    modelName: MODELS[g.model]?.name ?? null,
    aspectRatio: g.aspectRatio,
    resolution: '1K',
    count: g.count,
    referenceIds: g.referenceIds,
    collectionId: g.collectionId,
    status: g.status,
    error: g.error,
    source: 'api',
    estCostUsd: round((MODELS[g.model]?.estCostUsd ?? 0) * g.count),
    costUsd:
      g.images.length === 0 && g.failedCost === 0
        ? null
        : round(g.images.reduce((sum, image) => sum + image.costUsd, 0) + g.failedCost),
    failures: g.failures,
    images: g.images.map((image) => ({ ...image, url: `/api/v1/images/${image.id}/file` })),
    createdAt: new Date().toISOString(),
    finishedAt: g.status === 'running' ? null : new Date().toISOString(),
  });

  // The generation's images, one every `delay` ms.
  function run(g: FakeGeneration, n: number): void {
    later(delay, () => {
      const model = MODELS[g.model]!;
      if (failing.left > 0) {
        failing.left -= 1;
        g.failures.push(failing.reason);
        g.failedCost += failing.costUsd;
        spent += failing.costUsd;
      } else {
        made += 1;
        const [width, height] = SIZES[g.aspectRatio]!;
        const id = randomUUID();
        files.set(id, { bytes: png(width, height, made), mime: 'image/png' });
        g.images.push({ id, costUsd: model.costUsd, mime: 'image/png' });
        spent += model.costUsd;
        collections.find((c) => c.id === g.collectionId)?.imageIds.push(id);
      }
      if (n + 1 < g.count) return run(g, n + 1);
      g.status = g.images.length === g.count ? 'done' : g.images.length > 0 ? 'partial' : 'failed';
      g.error = g.status === 'failed' ? 'No image could be made.' : null;
    });
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://fake').pathname;
    // The tests' own routes: not recorded, never failed, no token.
    if (req.method === 'GET' && path === '/api/v1/__last') return send(res, 200, { referenceIds: lastReferenceIds, uploads });
    const forget = /^\/api\/v1\/__images\/([^/]+)$/.exec(path);
    if (req.method === 'DELETE' && forget) {
      files.delete(forget[1]!);
      res.writeHead(204);
      return void res.end();
    }
    const raw = req.method === 'POST' ? await readRaw(req) : Buffer.alloc(0);
    const upload = req.method === 'POST' && path === '/api/v1/uploads';
    const body = req.method === 'POST' && !upload ? parse(raw) : null;
    const token = bearerOf(req);
    calls.push({ method: req.method ?? '', path, body, bearer: token !== null });
    if (next) {
      const { status, body: answer } = next;
      next = null;
      return send(res, status, answer);
    }
    if (token !== FAKE_ATELIER_TOKENS.good && token !== FAKE_ATELIER_TOKENS.read) {
      return failure(res, 401, 'invalid_token', ATELIER_SENTENCES.invalidToken);
    }
    const write = token === FAKE_ATELIER_TOKENS.good;
    const get = req.method === 'GET';

    if (get && path === '/api/v1/token') {
      return send(
        res,
        200,
        write
          ? { id: '6c1f7a52-2d0b-4f43-9e3a-0b7d1c2e4f60', name: 'promptbook', access: 'write', createdAt: '2026-11-12T09:00:00.000Z', expiresAt: '2027-11-12T09:00:00.000Z' }
          : { id: '0e9d3b47-5a1c-4c88-b2f6-7d4e1a9c3b21', name: 'gallery', access: 'read', createdAt: '2026-11-01T09:00:00.000Z', expiresAt: null },
      );
    }
    if (get && path === '/api/v1/spend') {
      return send(res, 200, {
        month: { start: '2026-11-01T00:00:00.000Z', spent: round(spent), cap: 20, reserved: 0 },
        today: { start: '2026-11-12T00:00:00.000Z', spent: 0, images: 0 },
        byModel: [],
        byDay: [],
        bySource: [],
      });
    }
    if (get && path === '/api/v1/models') {
      return send(res, 200, {
        models: Object.entries(MODELS).map(([id, m], i) => ({
          id,
          name: m.name,
          enabled: true,
          isDefault: i === 0,
          aspectRatios: Object.keys(SIZES),
          resolutions: ['1K'],
          maxReferences: 4,
          estCostUsd: m.estCostUsd,
        })),
      });
    }
    const collectionJson = (c: FakeCollection) => ({ id: c.id, name: c.name, count: c.imageIds.length, createdAt: '2026-11-12T09:00:00.000Z' });
    if (get && path === '/api/v1/collections') return send(res, 200, { collections: collections.map(collectionJson) });

    const generation = /^\/api\/v1\/generations\/([^/]+)$/.exec(path);
    if (get && generation) {
      const found = generations.find((g) => g.id === generation[1]);
      return found ? send(res, 200, generationJson(found)) : failure(res, 404, 'not_found', 'Generation not found.');
    }
    const file = /^\/api\/v1\/images\/([^/]+)\/file$/.exec(path);
    if (get && file) {
      const found = files.get(file[1]!);
      if (!found) return failure(res, 404, 'not_found', 'Image not found.');
      res.writeHead(200, { 'content-type': found.mime, 'content-length': found.bytes.length });
      return void res.end(found.bytes);
    }

    if (req.method === 'POST' && !write) return failure(res, 403, 'insufficient_scope', 'This token is read only.');
    if (upload) {
      const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (!UPLOAD_TYPES.includes(type) || raw.length === 0) return failure(res, 415, 'unsupported_type', ATELIER_SENTENCES.wrongType);
      if (raw.length > MAX_UPLOAD_BYTES) return failure(res, 413, 'too_large', ATELIER_SENTENCES.tooLarge);
      uploads += 1;
      const hash = sha256(raw);
      const same = [...files].find(([, f]) => sha256(f.bytes) === hash);
      if (same) return send(res, 200, { id: same[0], mime: same[1].mime, origin: 'uploaded', url: `/api/v1/images/${same[0]}/file` });
      const id = randomUUID();
      files.set(id, { bytes: raw, mime: type });
      return send(res, 201, { id, mime: type, origin: 'uploaded', url: `/api/v1/images/${id}/file` });
    }
    const asked = (body ?? {}) as Record<string, unknown>;
    if (req.method === 'POST' && path === '/api/v1/collections') {
      const name = typeof asked.name === 'string' ? asked.name.trim() : '';
      if (name === '' || name.length > 60) return failure(res, 400, 'invalid_request', 'Name the collection, 1 to 60 characters.', 'name');
      if (collections.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return failure(res, 409, 'collection_exists', 'A collection with this name already exists.');
      }
      const created: FakeCollection = { id: randomUUID(), name, imageIds: [] };
      collections.push(created);
      return send(res, 201, collectionJson(created));
    }
    if (req.method === 'POST' && path === '/api/v1/generations') {
      const model = typeof asked.model === 'string' ? asked.model : '';
      const count = asked.count;
      if (
        !MODELS[model] ||
        typeof asked.prompt !== 'string' ||
        asked.prompt.trim() === '' ||
        typeof asked.aspectRatio !== 'string' ||
        !SIZES[asked.aspectRatio] ||
        typeof count !== 'number' ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 4
      ) {
        return failure(res, 400, 'invalid_request', 'The generation is not one Atelier can make.');
      }
      // As Atelier: uuids, each once, at most the model's references, all
      // of them images it has.
      const askedRefs: unknown = asked.referenceIds ?? [];
      lastReferenceIds = Array.isArray(askedRefs) ? askedRefs.filter((id): id is string => typeof id === 'string') : [];
      if (!Array.isArray(askedRefs) || !askedRefs.every((id) => typeof id === 'string' && UUID.test(id))) {
        return failure(res, 400, 'invalid_request', 'The reference images are not valid.', 'referenceIds');
      }
      const referenceIds = [...new Set(askedRefs as string[])];
      if (referenceIds.length > MAX_REFERENCES) {
        return failure(res, 400, 'invalid_request', `${MODELS[model]!.name} takes at most ${MAX_REFERENCES} reference images.`, 'referenceIds');
      }
      if (referenceIds.some((id) => !files.has(id))) {
        return failure(res, 400, 'invalid_request', ATELIER_SENTENCES.referenceNotFound, 'referenceIds');
      }
      const collectionId = asked.collectionId;
      if (
        collectionId !== undefined &&
        (typeof collectionId !== 'string' || !UUID.test(collectionId) || !collections.some((c) => c.id === collectionId))
      ) {
        return failure(res, 400, 'invalid_request', ATELIER_SENTENCES.noCollection, 'collectionId');
      }
      if (capped) {
        capped = false;
        return failure(res, 409, 'cap_reached', ATELIER_SENTENCES.capReached);
      }
      if (generations.filter((g) => g.status === 'running').length >= 3) {
        return failure(res, 429, 'too_many_running', ATELIER_SENTENCES.tooManyRunning);
      }
      const created: FakeGeneration = {
        id: randomUUID(),
        prompt: asked.prompt,
        model,
        aspectRatio: asked.aspectRatio,
        count,
        collectionId: typeof collectionId === 'string' ? collectionId : '',
        referenceIds,
        status: 'running',
        error: null,
        images: [],
        failures: [],
        failedCost: 0,
      };
      generations.push(created);
      run(created, 0);
      return send(res, 201, generationJson(created));
    }
    return failure(res, 404, 'not_found', 'Not found.');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) failure(res, 500, 'internal', 'The fake failed.');
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = options.host === undefined || options.host === '0.0.0.0' ? '127.0.0.1' : options.host;
  return {
    url: `http://${host}:${port}`,
    calls,
    collections,
    generations,
    setDelay(ms: number) {
      delay = ms;
    },
    failNext(n: number, reason = 'The model sent no image.', costUsd = 0) {
      failing = { left: n, reason, costUsd };
    },
    capReached() {
      capped = true;
    },
    dropCollection(id: string) {
      const at = collections.findIndex((c) => c.id === id);
      if (at >= 0) collections.splice(at, 1);
    },
    answerNext(status: number, answer: unknown) {
      next = { status, body: answer };
    },
    addImage(bytes: Buffer, mime = 'image/png') {
      const id = randomUUID();
      files.set(id, { bytes, mime });
      return id;
    },
    deleteImage(id: string) {
      files.delete(id);
    },
    lastReferenceIds: () => lastReferenceIds,
    uploads: () => uploads,
    close: () =>
      new Promise<void>((resolve) => {
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
