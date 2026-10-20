import { describe, expect, it } from 'vitest';
import { choosePlatform, hostOf } from '../src/platform/index.js';
import { fakeBridge } from './fake-bridge.js';

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

describe('hostOf', () => {
  it('names the host, or nothing before a server is known', () => {
    expect(hostOf('https://promptbook.siberio.eu')).toBe('promptbook.siberio.eu');
    expect(hostOf('http://localhost:8091')).toBe('localhost:8091');
    expect(hostOf('')).toBe('');
  });
});
