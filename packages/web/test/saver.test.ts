import { defaultSettings, type Settings } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { createSettingsSaver, type SaverState } from '../src/settings/saver.js';

// A fake server: every PUT waits until the test settles it.
function fakeServer() {
  const calls: { sent: Settings; resolve(s: Settings): void; reject(e: unknown): void }[] = [];
  let stored: Settings | null = null;
  const put = (sent: Settings) =>
    new Promise<Settings>((resolve, reject) =>
      calls.push({
        sent,
        resolve: (s) => {
          stored = s;
          resolve(s);
        },
        reject,
      }),
    );
  return { calls, put, stored: () => stored };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSettingsSaver', () => {
  it('sends one save at a time and the newest object last', async () => {
    const server = fakeServer();
    const states: SaverState[] = [];
    const initial = defaultSettings();
    const saver = createSettingsSaver(initial, server.put, (s) => states.push(s));

    const renamed = { ...initial, author: 'Stefano Sibilia' };
    const added = { ...renamed, copyright: '© 2026 Stefano Sibilia' };
    saver.save(renamed);
    saver.save(added);
    expect(server.calls).toHaveLength(1);
    expect(saver.state().settings).toBe(added);

    // The first answer must not replace the newer local object.
    server.calls[0]!.resolve(server.calls[0]!.sent);
    await tick();
    expect(saver.state().settings).toBe(added);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1]!.sent).toEqual(added);

    server.calls[1]!.resolve(server.calls[1]!.sent);
    await tick();
    expect(server.stored()).toEqual(added);
    expect(saver.state()).toMatchObject({ settings: added, saving: false, saved: true, error: '' });
  });

  it('puts back the confirmed settings after a failure and does not send the failed value again', async () => {
    const server = fakeServer();
    const initial = defaultSettings();
    const saver = createSettingsSaver(
      initial,
      server.put,
      () => {},
      () => 'licence: too long',
    );

    const good = { ...initial, author: 'Stefano Sibilia' };
    saver.save(good);
    server.calls[0]!.resolve(good);
    await tick();

    const bad = { ...good, licence: 'x'.repeat(300) };
    saver.save(bad);
    server.calls[1]!.reject(new Error('400'));
    await tick();
    expect(saver.state()).toMatchObject({ settings: good, saving: false, error: 'licence: too long', revision: 1 });

    const next = { ...saver.state().settings, system: 'Kulthos' };
    saver.save(next);
    expect(server.calls[2]!.sent).toEqual({ ...good, system: 'Kulthos' });
  });
});
