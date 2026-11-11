import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

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
    setDelay() {},
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
