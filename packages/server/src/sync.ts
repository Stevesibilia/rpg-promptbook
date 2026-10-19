import websocket from '@fastify/websocket';
import { Hocuspocus } from '@hocuspocus/server';
import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { storeProjectDoc } from './projects.js';

// Yjs sync over one WebSocket route, with Hocuspocus inside the Fastify
// process (design decision 6). The document name is the project id.

declare module 'fastify' {
  interface FastifyInstance {
    sync: Sync;
  }
}

// What every document connection on a socket carries. The socket's cookie is
// fixed at the upgrade, so all its documents share one session.
export interface SyncContext {
  userId: string | null;
  sessionHash: string | null;
}

// Stateless messages to a document's clients about storing it.
export const STORE_FAILED = JSON.stringify({ type: 'store-failed' });
export const STORED = JSON.stringify({ type: 'stored' });
// Sent before a project's connections close because it went to the bin.
export const DELETED = JSON.stringify({ type: 'deleted' });

// A socket closed because its session ended: the provider reconnects, and
// its next authentication fails, which the client shows as Sign in to sync.
const SESSION_ENDED = { code: 4401, reason: 'Unauthorized' };
// A document connection closed because the project went to the bin; the
// socket stays open for the client's other documents.
const PROJECT_GONE = { code: 4404, reason: 'Not found' };
const SHUTDOWN = { code: 1001, reason: 'Server shutting down' };

const STORE_RETRY_MS = 5_000;
const SLOW_STORE_MS = 500;
const SHUTDOWN_WAIT_MS = 5_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Sync {
  hocuspocus: Hocuspocus<SyncContext>;
  // Closes every socket opened with one of these sessions.
  closeSessions(sessionHashes: readonly string[]): void;
  // Closes every connection to a project's document.
  closeProject(projectId: string): void;
  // The document as the open clients have it, or null when no one has it open.
  liveDocument(projectId: string): Y.Doc | null;
  // Hands a socket from the /sync route to Hocuspocus.
  accept(socket: WebSocket, req: FastifyRequest): void;
  close(): Promise<void>;
}

function webRequest(req: FastifyRequest, publicOrigin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return new Request(new URL(req.url, publicOrigin), { headers });
}

export function createSync({ config, db, log }: { config: Config; db: Db; log: FastifyBaseLogger }): Sync {
  const sockets = new Map<WebSocket, SyncContext>();
  const retries = new Map<string, NodeJS.Timeout>();

  const hocuspocus: Hocuspocus<SyncContext> = new Hocuspocus<SyncContext>({
    quiet: true,
    debounce: 2_000,
    maxDebounce: 10_000,

    // Refuses unless the upgrade came from the public origin with a live
    // session of the project's owner, and the project is not in the bin.
    async onAuthenticate({ requestHeaders, documentName, context }) {
      if (requestHeaders.get('origin') !== config.publicOrigin) throw new Error('Cross-origin connection refused.');
      if (!context.sessionHash || !context.userId) throw new Error('Sign in first.');
      const session = await db.queryOne(
        'select 1 from sessions where token_hash = $1 and user_id = $2 and expires_at > now()',
        [context.sessionHash, context.userId],
      );
      if (!session) throw new Error('Sign in first.');
      const project =
        UUID.test(documentName) &&
        (await db.queryOne('select 1 from projects where id = $1 and owner_id = $2 and deleted_at is null', [
          documentName,
          context.userId,
        ]));
      if (!project) throw new Error('Not found.');
    },

    async onLoadDocument({ documentName, document }) {
      const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [
        documentName,
      ]);
      if (!row) throw new Error(`No stored document for project ${documentName}.`);
      Y.applyUpdate(document, row.state);
      return document;
    },

    async onStoreDocument(payload) {
      const { documentName, document } = payload;
      clearTimeout(retries.get(documentName));
      retries.delete(documentName);
      const started = performance.now();
      try {
        await storeProjectDoc(db, documentName, document);
      } catch (error) {
        log.error({ err: error, project: documentName }, 'Storing a project document failed');
        document.broadcastStateless(STORE_FAILED);
        // Hocuspocus keeps the document in memory after a failed store but
        // only stores again on the next edit: try again meanwhile, so a quiet
        // tab does not stay on Not saved once the database is back.
        retries.set(
          documentName,
          setTimeout(() => {
            retries.delete(documentName);
            if (hocuspocus.documents.get(documentName) === document) {
              void hocuspocus.storeDocumentHooks(document, payload, true);
            }
          }, STORE_RETRY_MS),
        );
        throw error;
      }
      const ms = performance.now() - started;
      if (ms > SLOW_STORE_MS) log.warn({ project: documentName, ms: Math.round(ms) }, 'Slow project store');
      // After every store, not only after a failure: the web list refreshes on it.
      document.broadcastStateless(STORED);
    },
  });

  return {
    hocuspocus,

    closeSessions(sessionHashes) {
      const ended = new Set(sessionHashes);
      for (const [socket, context] of sockets) {
        if (context.sessionHash && ended.has(context.sessionHash)) socket.close(SESSION_ENDED.code, SESSION_ENDED.reason);
      }
    },

    closeProject(projectId) {
      const document = hocuspocus.documents.get(projectId);
      if (!document) return;
      document.broadcastStateless(DELETED);
      document.connections.forEach((_clients, connection) => connection.close(PROJECT_GONE));
    },

    liveDocument(projectId) {
      return hocuspocus.documents.get(projectId) ?? null;
    },

    // Closes every socket, then waits for the last stores to finish so the
    // database is not closed under them.
    async close() {
      for (const socket of sockets.keys()) socket.close(SHUTDOWN.code, SHUTDOWN.reason);
      const deadline = Date.now() + SHUTDOWN_WAIT_MS;
      while (hocuspocus.getDocumentsCount() > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      for (const timer of retries.values()) clearTimeout(timer);
      retries.clear();
    },

    accept(socket, req) {
      // The auth hook has already resolved the cookie; onAuthenticate checks
      // the session again for every document.
      const context: SyncContext = {
        userId: req.session?.user.id ?? null,
        sessionHash: req.session?.tokenHash ?? null,
      };
      sockets.set(socket, context);
      const connection = hocuspocus.handleConnection(socket, webRequest(req, config.publicOrigin), { ...context });
      socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        connection.handleMessage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      });
      // Pongs count as activity, so a quiet but healthy client is not timed out.
      socket.on('pong', () => connection.touch());
      socket.on('close', (code: number, reason: Buffer) => {
        sockets.delete(socket);
        connection.handleClose({ code, reason: reason.toString() });
      });
      socket.on('error', (error) => log.warn({ err: error }, 'Sync socket error'));
    },
  };
}

async function plugin(app: FastifyInstance, { config, db }: { config: Config; db: Db }) {
  const sync = createSync({ config, db, log: app.log });
  app.decorate('sync', sync);
  await app.register(websocket, { options: { maxPayload: 20 * 1024 * 1024 } });
  app.get('/sync', { websocket: true }, (socket, req) => sync.accept(socket, req));
  app.addHook('preClose', () => sync.close());
}

export const syncPlugin = fp(plugin, { name: 'sync' });
