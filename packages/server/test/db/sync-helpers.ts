import type { AddressInfo } from 'node:net';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { ORIGIN } from './helpers.js';

// Real Hocuspocus providers against the real server, over the ws package so
// they can send the cookie and Origin a browser would, or, as the desktop
// app does, no cookie and no Origin and an access token as the sync token.

export async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;
  return `ws://127.0.0.1:${port}/sync`;
}

export interface Client {
  provider: HocuspocusProvider;
  doc: Y.Doc;
  stateless: string[];
  authFailures: string[];
  closes: string[];
  destroy(): void;
}

const clients: Client[] = [];

export function connect(
  url: string,
  projectId: string,
  {
    token,
    origin = ORIGIN,
    doc = new Y.Doc(),
    appToken,
  }: { token?: string | null; origin?: string | null; doc?: Y.Doc; appToken?: string } = {},
): Client {
  const headers: Record<string, string> = {};
  if (origin !== null) headers.origin = origin;
  if (token) headers.cookie = `pb_session=${token}`;
  class CookieSocket extends WebSocket {
    constructor(address: string) {
      super(address, { headers });
    }
  }
  const client: Client = {
    doc,
    stateless: [],
    authFailures: [],
    closes: [],
    provider: null as unknown as HocuspocusProvider,
    destroy() {
      client.provider.destroy();
    },
  };
  client.provider = new HocuspocusProvider({
    url,
    name: projectId,
    document: doc,
    WebSocketPolyfill: CookieSocket,
    ...(appToken === undefined ? {} : { token: appToken }),
    // Reconnect fast, so the tests do not wait on the default back-off.
    delay: 50,
    minDelay: 50,
    maxDelay: 200,
    onStateless: ({ payload }) => client.stateless.push(payload),
    onAuthenticationFailed: ({ reason }) => client.authFailures.push(reason),
    onClose: ({ event }) => client.closes.push(`${event.code} ${event.reason}`),
  } as ConstructorParameters<typeof HocuspocusProvider>[0]);
  clients.push(client);
  return client;
}

export function destroyClients(): void {
  for (const client of clients.splice(0)) client.destroy();
}

export async function waitFor(check: () => boolean | Promise<boolean>, what: string, timeout = 8_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export const synced = (client: Client) => waitFor(() => client.provider.isSynced, 'the provider to sync');
