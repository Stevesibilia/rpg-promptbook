import { join } from 'node:path';
import { Creator } from '../../src/main/create.js';
import { ProjectList } from '../../src/main/projects.js';
import { Router } from '../../src/main/router.js';
import { ServerClient } from '../../src/main/server.js';
import { LocalSnapshots } from '../../src/main/snapshots.js';
import { Store } from '../../src/main/store.js';
import { SyncEngine } from '../../src/main/sync.js';
import { fakeServer, tempDir, type Handler } from './helpers.js';
import { Hocus } from './hocus.js';

// An account as main holds it, with a fake REST server and a Hocuspocus
// server in this process.
export async function world(rest: Handler, { online = true } = {}) {
  const dir = tempDir();
  const hocus = new Hocus();
  await hocus.start();
  if (!online) await hocus.stop();
  const api = await fakeServer(rest);
  const store = Store.open(join(dir.dir, 'promptbook.sqlite'));
  const sent: { to: number; id: string; update: Uint8Array }[] = [];
  const ended: number[] = [];
  let access = 'pb_at_1';
  const tokens = {
    accessToken: async () => access,
    invalidate: (value: string) => {
      if (value === access) access = 'pb_at_2';
    },
  };
  const client = new ServerClient(api.origin, tokens, () => ended.push(1));
  let list!: ProjectList;
  let snapshots!: LocalSnapshots;
  const engine = new SyncEngine({
    url: hocus.url,
    healthUrl: hocus.healthUrl,
    healthEveryMs: 100,
    store,
    statusDelayMs: 5,
    hooks: {
      token: async () => hocus.token,
      sendUpdate: (to, id, update) => sent.push({ to, id, update }),
      status: () => {},
      stateless: () => {},
      docChanged: (id, local) => list?.docChanged(id, local),
      added: (id) => snapshots?.track(id),
      downloaded: (id) => snapshots?.baseline(id),
      removed: (id) => snapshots?.untrack(id),
    },
  });
  list = new ProjectList(store, engine, () => client);
  const creator = new Creator(store, engine, list, () => client, Date.now, () => {});
  snapshots = new LocalSnapshots({ store, engine });
  const router = new Router({ store, engine, list, creator, snapshots, server: () => client });
  engine.setActive(true);
  const request = async (method: string, path: string, body?: unknown) => {
    const answer = await router.handle(path, {
      method,
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = answer.body ? new TextDecoder().decode(answer.body) : '';
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { ...answer, json: json as any };
  };
  return {
    dir,
    hocus,
    api,
    store,
    engine,
    list,
    creator,
    snapshots,
    router,
    request,
    sent,
    ended,
    async close() {
      snapshots.stop();
      list.close();
      engine.close();
      store.close();
      await hocus.stop();
      await api.close();
      dir.remove();
    },
  };
}

export type World = Awaited<ReturnType<typeof world>>;
