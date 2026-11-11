import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crc32, deflateSync } from 'node:zlib';

// A fake OpenRouter for the tests, the end-to-end stack and the owner's
// preview (board-image-generation design decision 17), shaped like the real
// one as measured on 2026-11-11. Built-ins only and erasable TypeScript only,
// so Node runs it with its types stripped (e2e/openrouter/serve.mjs).
//
// Keys, as bearer tokens:
//   sk-or-v1-good     works, $9.50 of $10 left
//   sk-or-v1-broke    works for GET /key, answers 402 to an image
//   sk-or-v1-nolimit  works, no spending limit
//   anything else     401
//
// POST /api/v1/images refuses an unknown model, a resolution other than 1K
// and an aspect ratio outside the four shapes with 400, as OpenRouter does,
// then answers one image after the delay: a PNG for GPT Image, a JPEG for
// Nano Banana, each with bytes of its own, since the board skips a file it
// already lists.

export interface FakeCall {
  method: string;
  path: string;
  // The parsed JSON body; null when none or not JSON.
  body: unknown;
  // Whether the request carried a bearer token. The token itself is never
  // recorded.
  bearer: boolean;
}

export interface FakeOpenRouterOptions {
  host?: string;
  port?: number;
  // How long an image takes.
  delayMs?: number;
}

export interface FakeOpenRouter {
  // Ends in /api/v1, as OPENROUTER_BASE_URL.
  baseUrl: string;
  calls: FakeCall[];
  setDelay(ms: number): void;
  // The next call answers this status and body instead.
  failNext(status: number, body?: unknown): void;
  close(): Promise<void>;
}

const MODELS: Record<string, { mime: string; cost: number }> = {
  'openai/gpt-image-2.6-sunburst': { mime: 'image/png', cost: 0.04 },
  'google/gemini-nano-banana-2.1': { mime: 'image/jpeg', cost: 0.037 },
};

// Small sizes in each shape's ratio.
const SIZES: Record<string, [number, number]> = {
  '16:9': [160, 90],
  '3:2': [150, 100],
  '1:1': [120, 120],
  '2:3': [100, 150],
};

// Real JPEGs of those sizes, a gradient each (ImageMagick, quality 60).
const JPEGS: Record<string, string> = {
  '16:9': '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABaAKADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAMG/8QAFRABAQAAAAAAAAAAAAAAAAAAABL/xAAXAQEBAQEAAAAAAAAAAAAAAAAAAwIE/8QAFhEBAQEAAAAAAAAAAAAAAAAAABES/9oADAMBAAIRAxEAPwDPyStJLo0nEZJWkk0RGSVpJNERklaSTREZJWkk0RGSVpJNERklaSTREZJWkk0RGSVpJNERklaSTRFZJVklLTcSklWSTREpJVkk0RKSVZJNESklWSTREpJVkk0RKSVZJNESklWSTREpJVkk0RKSVZJNEVklaSUdKRGSVpJNERklaSTREZJWkk0RGSVpJNERklaSTREZJWkk0RGSVpJNERklaSTREZJWkk0RWSVZJS03EpJVkk0RKSVZJNESklWSTREpJVkk0RKSVZJNESklWSTREpJVkk0RKSVZJNESklWSTRFZJWklHSkRklaSTREZJWkk0RGSVpJNERklaSTREZJWkk0RGSVpJNERklaSTREZJWkk0RGSVpJNEVklQSrcTklQKROSVApE5JUCkTklQKROSVApE5JUCkTklQKROSVApE5JUCkf/9k=',
  '3:2': '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABkAJYDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAMG/8QAFhABAQEAAAAAAAAAAAAAAAAAABIR/8QAFwEBAQEBAAAAAAAAAAAAAAAAAAMCBP/EABURAQEAAAAAAAAAAAAAAAAAAAAR/9oADAMBAAIRAxEAPwDP4YrJLoqUSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwVkKRWSVJJSqkTklSSSkTklSSSkTklSSSkTklSSSkTklSSSkTklSSSkTklSSSkTklSSSkTkUkKRXDFZJSrcSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwVkKRWSVJJTrcTklSSSkTklSSSkTklSSSkTklSSSkTklSSSkTklSSSkTklSSSkTklSSSkTkUkKRWSVZJSrcSklWSSkSklWSSkSklWSSkSklWSSkSklWSSkSklWSSkSklWSSkSklWSSkSkVkKRTDFZJSrcSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwxWSSkSwVkKRTDAYaMMADDAAwwAMMADDAAwwAMMADDAAwAH/2Q==',
  '1:1': '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAB4AHgDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAMCBv/EABYQAQEBAAAAAAAAAAAAAAAAAAAREv/EABcBAQEBAQAAAAAAAAAAAAAAAAACAwT/xAAVEQEBAAAAAAAAAAAAAAAAAAAAEf/aAAwDAQACEQMRAD8A5+EUyZdNZROEUyZKROEUyZKROEUyZKROEUyZKROEUyZKROEUyZKROCmQpFIRuEZ1cYhG4QpGIRuEKRiEbhCkYhG4QpGIRuEKRiEbhCkYg3ApFIRSEZ1UThFIQpE4RSEKROEUhCkThFIQpE4RSEKROEUhCkTgpApFIRSEZVcThFIQpE4RSEKROEUhCkThFIQpE4RSEKROEUhCkTgpApFMmVIRFXE8mVIQpE8mVIQpE8mVIQpE8mVIQpE8mVIQpE8mVIQpE8ikCkUhFMmWVVE4RTJkpE4RTJkpE4RTJkpE4RTJkpE4RTJkpE4RTJkpE4KZCkUhFIRnVxOEUhCkThFIQpE4RSEKROEUhCkThFIQpE4RSEKROCkCkUhAQohAAhAAhAAhAAhAAhAAgAP/2Q==',
  '2:3': '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCACWAGQDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAIDBv/EABUQAQEAAAAAAAAAAAAAAAAAAAAR/8QAGAEBAQEBAQAAAAAAAAAAAAAAAAIDAQT/xAAVEQEBAAAAAAAAAAAAAAAAAAAAEf/aAAwDAQACEQMRAD8A56EXCPTWURCLhCkRCLhCkRCLhCkRCLhCkRCLhCkRBcCkaQi4RFVEQi4QpEQi4QpEQi4QpEQi4QpEQi4QpEQXApFwi4RFVEQi4QpEQi4QpEQi4QpEQi4QpEQi4QpEQXApFwi4RnVREIuEKREIuEKREIuEKREIuEKREIuEKREFwKRcI0hEVUZwjSEKRnCNIQpGcI0hCkZwjSEKRnCNIQpGcGkCkXCLhEVURCLhCkRCLhCkRCLhCkRCLhCkRCLhCkRBcCkXCLhEVcRCLhCkRCLhCkRCLhCkRCLhCkRCLhCkRBcCkXCNIRnVRnCNIQpGcI0hCkZwjSEKRnCNIQpGcI0hCkZwaQKRcIuERVREIuEKREIuEKREIuEKREIuEKREIuEKREFwKRcICXSEACEACEACEACEACAA/9k=',
};

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

// A picture in one colour per call, a band of another across it, as
// e2e/media.ts draws them.
export function png(width: number, height: number, call: number): Buffer {
  const [r, g, b] = [(call * 53) % 256, (call * 97) % 256, (call * 151) % 256];
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const band = y > height / 3 && y < (2 * height) / 3;
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
    pngChunk('tEXt', Buffer.from(`Comment\0fake openrouter ${RUN} call ${call}`, 'latin1')),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// The shape's JPEG with a comment segment naming the call, right after SOI.
export function jpeg(shape: string, call: number): Buffer {
  const base = Buffer.from(JPEGS[shape]!, 'base64');
  const text = Buffer.from(`fake openrouter ${RUN} call ${call}`, 'ascii');
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = 0xfe;
  head.writeUInt16BE(text.length + 2, 2);
  return Buffer.concat([base.subarray(0, 2), head, text, base.subarray(2)]);
}

const GOOD = 'sk-or-v1-good';
const BROKE = 'sk-or-v1-broke';
const NOLIMIT = 'sk-or-v1-nolimit';

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body ?? {});
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}

const unauthorized = (res: ServerResponse) => send(res, 401, { error: { code: 401, message: 'No auth credentials found' } });

function bearerOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

export async function startFakeOpenRouter(options: FakeOpenRouterOptions = {}): Promise<FakeOpenRouter> {
  const calls: FakeCall[] = [];
  let failure: { status: number; body: unknown } | null = null;
  let delay = options.delayMs ?? 0;
  let images = 0;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://fake').pathname;
    const body = req.method === 'POST' ? await readBody(req) : null;
    const key = bearerOf(req);
    calls.push({ method: req.method ?? '', path, body, bearer: key !== null });
    if (failure) {
      const { status, body: answer } = failure;
      failure = null;
      return send(res, status, answer);
    }
    if (req.method === 'GET' && path === '/api/v1/key') {
      if (key === GOOD || key === BROKE) {
        return send(res, 200, {
          data: { label: 'sk-or-v1-…', limit: 10, limit_remaining: 9.5, usage: 0.5, is_free_tier: false },
        });
      }
      if (key === NOLIMIT) {
        return send(res, 200, {
          data: { label: 'sk-or-v1-…', limit: null, limit_remaining: null, usage: 0.5, is_free_tier: false },
        });
      }
      return unauthorized(res);
    }
    if (req.method === 'POST' && path === '/api/v1/images') {
      if (key !== GOOD && key !== BROKE) return unauthorized(res);
      const asked = (body ?? {}) as { model?: unknown; prompt?: unknown; aspect_ratio?: unknown; resolution?: unknown };
      const model = typeof asked.model === 'string' ? MODELS[asked.model] : undefined;
      const shape = typeof asked.aspect_ratio === 'string' && SIZES[asked.aspect_ratio] ? asked.aspect_ratio : null;
      if (!model || shape === null || asked.resolution !== '1K' || typeof asked.prompt !== 'string' || asked.prompt === '') {
        return send(res, 400, { error: { code: 400, message: 'Invalid request: model, prompt, aspect_ratio or resolution' } });
      }
      if (key === BROKE) return send(res, 402, { error: { code: 402, message: 'Insufficient credits' } });
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (res.destroyed) return;
      images += 1;
      const [width, height] = SIZES[shape]!;
      const bytes = model.mime === 'image/png' ? png(width, height, images) : jpeg(shape, images);
      return send(res, 200, {
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: bytes.toString('base64'), media_type: model.mime }],
        usage: { cost: model.cost },
      });
    }
    return send(res, 404, { error: { code: 404, message: 'Not found' } });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: { code: 500, message: 'fake failed' } });
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = options.host === undefined || options.host === '0.0.0.0' ? '127.0.0.1' : options.host;
  return {
    baseUrl: `http://${host}:${port}/api/v1`,
    calls,
    setDelay(ms: number) {
      delay = ms;
    },
    failNext(status: number, answer: unknown = { error: { code: status, message: `HTTP ${status}` } }) {
      failure = { status, body: answer };
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
