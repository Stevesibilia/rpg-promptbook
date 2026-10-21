import { describe, expect, it } from 'vitest';
import { choosePlatform, hostOf } from '../src/platform/index.js';
import { fakeBridge, signedIn } from './fake-bridge.js';

describe('choosePlatform', () => {
  it('is the browser without the desktop bridge', () => {
    expect(choosePlatform(undefined).kind).toBe('web');
    expect(choosePlatform({}).kind).toBe('web');
    expect(choosePlatform({}).desktop).toBeNull();
  });

  it('is the desktop with window.promptbook, its server from main', async () => {
    const { bridge } = fakeBridge();
    const platform = choosePlatform({ promptbook: bridge });
    expect(platform.kind).toBe('desktop');
    await platform.init();
    expect(platform.serverOrigin).toBe('https://promptbook.example');
    expect(platform.desktop?.info.get().os).toBe('darwin');
  });

  it('sends REST through main and answers it as fetch would', async () => {
    const { bridge, calls } = fakeBridge();
    const platform = choosePlatform({ promptbook: bridge });
    const answer = await platform.request('/api/projects', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{"title":"La fiera di Randazzo"}',
    });
    expect(calls.request).toEqual([
      [
        '/api/projects',
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: '{"title":"La fiera di Randazzo"}',
        },
      ],
    ]);
    expect(answer.status).toBe(503);
    expect(await answer.json()).toEqual({ error: 'offline', message: 'Needs the server.' });
    const empty = await platform.request('/api/settings', { method: 'DELETE' });
    expect(empty.status).toBe(204);
  });
});

describe('the desktop platform', () => {
  it("keeps main's newer auth event over the first read's older answer", async () => {
    const fake = fakeBridge();
    const ended = { ...signedIn, session: 'ended' as const };
    // The read answers active; main ends the session before init settles.
    const state = fake.bridge.auth.state;
    fake.bridge.auth.state = async () => {
      const answer = await state();
      fake.events.auth.emit(ended);
      return answer;
    };
    const platform = choosePlatform({ promptbook: fake.bridge });
    await platform.init();
    expect(platform.desktop?.auth.get().session).toBe('ended');
  });

  it('starts one sign-in at a time, until main reports the browser step', async () => {
    const fake = fakeBridge();
    const starts: string[] = [];
    fake.bridge.auth.start = async (server) => void starts.push(server);
    const platform = choosePlatform({ promptbook: fake.bridge });
    platform.desktop!.startSignIn('https://a.example');
    platform.desktop!.startSignIn('https://a.example');
    platform.startSignIn();
    expect(starts).toEqual(['https://a.example']);
    fake.events.auth.emit({ ...signedIn, signIn: { step: 'browser', host: 'a.example' } });
    platform.desktop!.startSignIn('https://a.example');
    expect(starts).toHaveLength(2);
  });
});

describe('hostOf', () => {
  it('names the host, or nothing before a server is known', () => {
    expect(hostOf('https://promptbook.siberio.eu')).toBe('promptbook.siberio.eu');
    expect(hostOf('http://localhost:8091')).toBe('localhost:8091');
    expect(hostOf('')).toBe('');
  });
});

describe('the CueBard export on the desktop', () => {
  it('asks main with the pack name the server would give, and answers its message without the IPC prefix', async () => {
    const fake = fakeBridge();
    const platform = choosePlatform({ promptbook: fake.bridge });
    expect(await platform.exportCuebard('p1', 'Notte? 50%')).toEqual({ saved: true, leftOut: 0, name: 'Notte- 50-.cbpack' });
    expect(fake.calls.exportCuebard).toEqual([['p1', 'Notte- 50-.cbpack']]);
    fake.bridge.files.exportCuebard = async () => {
      throw new Error("Error invoking remote method 'pb:files:export-cuebard': Error: This project is not on this computer yet.");
    };
    await expect(platform.exportCuebard('p1', 'x')).rejects.toThrow(/^This project is not on this computer yet\.$/);
    fake.bridge.files.exportCuebard = async () => {
      throw new Error('');
    };
    await expect(platform.exportCuebard('p1', 'x')).rejects.toThrow('The CueBard pack could not be saved.');
  });
});
