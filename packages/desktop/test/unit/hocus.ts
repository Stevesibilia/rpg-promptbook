import { Server } from '@hocuspocus/server';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import * as Y from 'yjs';

// A Hocuspocus server in this process, standing in for /sync. Its documents
// survive a restart, as Postgres keeps them; stop() cuts every socket, as a
// stopped server process does (the server's destroy() leaves open
// WebSockets as they are).
export class Hocus {
  readonly kept = new Map<string, Uint8Array>();
  server: Server | null = null;
  port = 0;
  token = 'good';
  private sockets = new Set<Socket>();

  get url(): string {
    return `ws://127.0.0.1:${this.port}`;
  }

  // Hocuspocus answers any plain request while it listens.
  get healthUrl(): string {
    return `http://127.0.0.1:${this.port}/`;
  }

  async start(): Promise<void> {
    // Hocuspocus reads port 0 as its default, 80: a free one is found first.
    if (!this.port) this.port = await freePort();
    const server = new Server({
      quiet: true,
      debounce: 10,
      maxDebounce: 50,
      onAuthenticate: async ({ token }) => {
        if (token !== this.token) throw new Error('refused');
      },
      onLoadDocument: async ({ document, documentName }) => {
        const state = this.kept.get(documentName);
        if (state) Y.applyUpdate(document, state);
        return document;
      },
      onStoreDocument: async ({ document, documentName }) => {
        this.kept.set(documentName, Y.encodeStateAsUpdate(document));
      },
    });
    await server.listen(this.port);
    this.port = server.address.port;
    server.httpServer.on('connection', (socket: Socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await this.server?.destroy();
    this.server = null;
  }

  async text(id: string): Promise<string> {
    const connection = await this.server!.hocuspocus.openDirectConnection(id);
    let text = '';
    await connection.transact((doc) => {
      text = doc.getText('document').toString();
    });
    await connection.disconnect();
    return text;
  }
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
