// A fake Atelier for the end-to-end tests and the owner's preview
// (atelier-image-provider design decision 15). Its answers are copied from
// the server tests' fake (packages/server/test/db/fake-atelier.ts), which
// follows Atelier's v0.8.0 /api/v1; nothing is imported from there, so this
// file runs on its own in a container of the app's image. Built-ins only.
//
// Tokens, as bearer tokens:
//   atl_pat_good    write, named "promptbook", expires 2027-11-12
//   atl_pat_capped  write, named "promptbook"; every start answers 409
//                   cap_reached, as Atelier does at its monthly cap
//   atl_pat_read    read only, named "gallery", never expires
//   anything else   401 invalid_token
//
//   FAKE_ATELIER_PORT      the port to listen on, inside the container
//   FAKE_ATELIER_DELAY_MS  the time between two images of a generation
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';

const port = Number(process.env.FAKE_ATELIER_PORT ?? 8098);
const delay = Number(process.env.FAKE_ATELIER_DELAY_MS ?? 0);

const TOKENS = {
  atl_pat_good: { write: true, capped: false },
  atl_pat_capped: { write: true, capped: true },
  atl_pat_read: { write: false, capped: false },
};

// Atelier's sentences (measured on 2026-11-12).
const SENTENCES = {
  capReached: 'This would pass your monthly cap of $20.00 ($19.96 spent). Raise the cap in Settings or wait for next month.',
  tooManyRunning: 'Three generations are already running. Wait for one to finish.',
  noCollection: 'Choose a collection that exists.',
  invalidToken: 'The API token is missing, unknown, revoked or expired.',
};

const MODELS = {
  'openai/gpt-image-2.6-sunburst': { name: 'GPT Image 2.6 Sunburst', estCostUsd: 0.083, costUsd: 0.08 },
  'google/gemini-nano-banana-2.1': { name: 'Nano Banana 2.1', estCostUsd: 0.037, costUsd: 0.037 },
};

const SIZES = { '16:9': [160, 90], '3:2': [150, 100], '1:1': [120, 120], '2:3': [100, 150] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Different in every process, so a restarted fake never sends the bytes it
// sent before: the board would skip them as already listed.
const RUN = randomUUID();

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// A picture in one colour per image, a band of another across it.
function png(width, height, n) {
  const [r, g, b] = [(n * 71) % 256, (n * 113) % 256, (n * 167) % 256];
  const rows = [];
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

function send(res, status, body) {
  const text = JSON.stringify(body ?? {});
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

const failure = (res, status, error, message, field) =>
  send(res, status, field === undefined ? { error, message } : { error, message, field });

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

const round = (value) => Math.round(value * 1e6) / 1e6;

const collections = [];
const generations = [];
const files = new Map();
let made = 0;
// This month's spend before the tests' images, as GET /spend answers it.
let spent = 4.12;

const generationJson = (g) => ({
  id: g.id,
  prompt: g.prompt,
  model: g.model,
  modelName: MODELS[g.model]?.name ?? null,
  aspectRatio: g.aspectRatio,
  resolution: '1K',
  count: g.count,
  referenceIds: [],
  collectionId: g.collectionId,
  status: g.status,
  error: g.error,
  source: 'api',
  estCostUsd: round((MODELS[g.model]?.estCostUsd ?? 0) * g.count),
  costUsd: g.images.length === 0 ? null : round(g.images.reduce((sum, image) => sum + image.costUsd, 0)),
  failures: g.failures,
  images: g.images.map((image) => ({ ...image, url: `/api/v1/images/${image.id}/file` })),
  createdAt: g.createdAt,
  finishedAt: g.finishedAt,
});

const collectionJson = (c) => ({ id: c.id, name: c.name, count: c.imageIds.length, createdAt: c.createdAt });

// The generation's images, one every `delay` ms.
function run(g, n) {
  setTimeout(() => {
    const model = MODELS[g.model];
    made += 1;
    const [width, height] = SIZES[g.aspectRatio];
    const id = randomUUID();
    files.set(id, { bytes: png(width, height, made), mime: 'image/png' });
    g.images.push({ id, costUsd: model.costUsd, mime: 'image/png' });
    spent += model.costUsd;
    collections.find((c) => c.id === g.collectionId)?.imageIds.push(id);
    if (n + 1 < g.count) return run(g, n + 1);
    g.status = 'done';
    g.finishedAt = new Date().toISOString();
  }, delay);
}

async function handle(req, res) {
  const path = new URL(req.url ?? '/', 'http://fake').pathname;
  const body = req.method === 'POST' ? await readBody(req) : null;
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const holder = token !== null && Object.hasOwn(TOKENS, token) ? TOKENS[token] : null;
  if (!holder) return failure(res, 401, 'invalid_token', SENTENCES.invalidToken);
  const get = req.method === 'GET';

  if (get && path === '/api/v1/token') {
    return send(
      res,
      200,
      holder.write
        ? {
            id: '6c1f7a52-2d0b-4f43-9e3a-0b7d1c2e4f60',
            name: 'promptbook',
            access: 'write',
            createdAt: '2026-11-12T09:00:00.000Z',
            expiresAt: '2027-11-12T09:00:00.000Z',
          }
        : {
            id: '0e9d3b47-5a1c-4c88-b2f6-7d4e1a9c3b21',
            name: 'gallery',
            access: 'read',
            createdAt: '2026-11-01T09:00:00.000Z',
            expiresAt: null,
          },
    );
  }
  if (get && path === '/api/v1/spend') {
    const now = new Date();
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    return send(res, 200, {
      month: { start: month, spent: round(spent), cap: 20, reserved: 0 },
      today: { start: today, spent: 0, images: 0 },
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
  if (get && path === '/api/v1/collections') return send(res, 200, { collections: collections.map(collectionJson) });

  const generation = /^\/api\/v1\/generations\/([^/]+)$/.exec(path);
  if (get && generation) {
    const found = generations.find((g) => g.id === generation[1]);
    return found ? send(res, 200, generationJson(found)) : failure(res, 404, 'not_found', 'Generation not found.');
  }
  const file = /^\/api\/v1\/images\/([^/]+)\/file$/.exec(path);
  if (get && file) {
    const found = files.get(file[1]);
    if (!found) return failure(res, 404, 'not_found', 'Image not found.');
    res.writeHead(200, { 'content-type': found.mime, 'content-length': found.bytes.length });
    return void res.end(found.bytes);
  }

  if (req.method === 'POST' && !holder.write) return failure(res, 403, 'insufficient_scope', 'This token is read only.');
  const asked = body && typeof body === 'object' ? body : {};
  if (req.method === 'POST' && path === '/api/v1/collections') {
    const name = typeof asked.name === 'string' ? asked.name.trim() : '';
    if (name === '' || name.length > 60) {
      return failure(res, 400, 'invalid_request', 'Name the collection, 1 to 60 characters.', 'name');
    }
    if (collections.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return failure(res, 409, 'collection_exists', 'A collection with this name already exists.');
    }
    const created = { id: randomUUID(), name, imageIds: [], createdAt: new Date().toISOString() };
    collections.push(created);
    return send(res, 201, collectionJson(created));
  }
  if (req.method === 'POST' && path === '/api/v1/generations') {
    const model = typeof asked.model === 'string' ? asked.model : '';
    const count = asked.count;
    if (
      !Object.hasOwn(MODELS, model) ||
      typeof asked.prompt !== 'string' ||
      asked.prompt.trim() === '' ||
      typeof asked.aspectRatio !== 'string' ||
      !Object.hasOwn(SIZES, asked.aspectRatio) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 4
    ) {
      return failure(res, 400, 'invalid_request', 'The generation is not one Atelier can make.');
    }
    const collectionId = asked.collectionId;
    if (
      collectionId !== undefined &&
      (typeof collectionId !== 'string' || !UUID.test(collectionId) || !collections.some((c) => c.id === collectionId))
    ) {
      return failure(res, 400, 'invalid_request', SENTENCES.noCollection, 'collectionId');
    }
    if (holder.capped) return failure(res, 409, 'cap_reached', SENTENCES.capReached);
    if (generations.filter((g) => g.status === 'running').length >= 3) {
      return failure(res, 429, 'too_many_running', SENTENCES.tooManyRunning);
    }
    const created = {
      id: randomUUID(),
      prompt: asked.prompt,
      model,
      aspectRatio: asked.aspectRatio,
      count,
      collectionId: typeof collectionId === 'string' ? collectionId : '',
      status: 'running',
      error: null,
      images: [],
      failures: [],
      createdAt: new Date().toISOString(),
      finishedAt: null,
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
server.listen(port, '0.0.0.0', () => console.log(`Fake Atelier at http://0.0.0.0:${port}`));

const stop = () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
