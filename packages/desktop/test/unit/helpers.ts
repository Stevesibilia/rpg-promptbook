import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectDoc, projectRow, summarize, type ProjectRow } from 'promptbook-project';
import * as Y from 'yjs';

export const tempDir = (prefix = 'pb-desktop-') => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
};

export interface Recorded {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: string;
}

export type Handler = (req: Recorded, res: ServerResponse) => void | Promise<void>;

// A small HTTP server standing in for the Promptbook server's REST API and
// its authorization server. Every request is recorded.
export async function fakeServer(handler: Handler): Promise<{
  origin: string;
  requests: Recorded[];
  close: () => Promise<void>;
  server: Server;
}> {
  const requests: Recorded[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => {
      const recorded = { method: req.method ?? 'GET', path: req.url ?? '/', headers: req.headers, body };
      requests.push(recorded);
      void Promise.resolve(handler(recorded, res)).catch((error: unknown) => {
        res.writeHead(500).end(String(error));
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    server,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
};

// A project document as the server would make it.
export function projectDoc(id: string, title = 'La fiera di Randazzo', text = '---\ntitolo: x\n---\n## Scene\n'): Y.Doc {
  return createProjectDoc({
    id,
    title,
    category: 'one-shot',
    status: 'draft',
    campaignId: null,
    system: '',
    seed: '',
    todo: [],
    document: text,
    createdAt: '2026-10-01T10:00:00.000Z',
  });
}

export const rowOf = (doc: Y.Doc, editedAt = '2026-10-01T10:00:00.000Z'): ProjectRow =>
  projectRow(summarize(doc, { campaigns: [] }), { createdAt: '2026-10-01T10:00:00.000Z', editedAt, deletedAt: null }, []);

export const until = async (check: () => boolean | Promise<boolean>, timeoutMs = 5_000) => {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Timed out waiting.');
    await new Promise((r) => setTimeout(r, 20));
  }
};
