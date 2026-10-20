import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdatesState } from 'promptbook-web/src/platform/bridge.js';
import {
  CHECK_EVERY_MS,
  compareVersions,
  installKind,
  LATEST_RELEASE_API,
  notesOf,
  parseLatestRelease,
  Updater,
  type AutoUpdater,
  type UpdaterOptions,
} from '../../src/main/updater.js';

// The updater's decisions (desktop-app design decision 14): who installs
// updates, which version is newer, and the states the window is told, with
// electron-updater and GitHub's API faked.

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  body: '* History shows this device.',
  html_url: `https://github.com/Stevesibilia/rpg-promptbook/releases/tag/${tag}`,
  ...extra,
});

class FakeAutoUpdater extends EventEmitter implements AutoUpdater {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checks = 0;
  installs = 0;
  // What a check does: emits events, or fails.
  onCheck: (u: FakeAutoUpdater) => void = () => this.emit('update-not-available', {});
  async checkForUpdates() {
    this.checks += 1;
    this.onCheck(this);
    return null;
  }
  quitAndInstall() {
    this.installs += 1;
  }
}

function setup(patch: Partial<UpdaterOptions> & { answer?: () => Response | Promise<Response> } = {}) {
  const states: UpdatesState[] = [];
  const opened: string[] = [];
  const auto = new FakeAutoUpdater();
  const lookups: { url: string; init: RequestInit | undefined }[] = [];
  const answer = patch.answer ?? (() => Response.json(release('v0.5.0')));
  const updater = new Updater({
    packaged: true,
    kind: 'manual',
    version: '0.5.0',
    autoUpdater: () => auto,
    emit: (state) => states.push(state),
    openExternal: (url) => void opened.push(url),
    fetch: (async (url: string, init?: RequestInit) => {
      lookups.push({ url, init });
      return answer();
    }) as typeof fetch,
    log: () => {},
    ...patch,
  });
  return { updater, states, opened, auto, lookups };
}

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
});

describe('who installs updates', () => {
  it('is Windows and the AppImage, not a Mac or the deb package', () => {
    expect(installKind('win32', {})).toBe('self');
    expect(installKind('linux', { APPIMAGE: '/home/s/Promptbook.AppImage' })).toBe('self');
    expect(installKind('linux', {})).toBe('manual');
    expect(installKind('darwin', { APPIMAGE: 'x' })).toBe('manual');
  });
});

describe('versions', () => {
  it('compares by number, part by part', () => {
    expect(compareVersions('0.6.0', '0.5.0')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('v0.5.0', '0.5')).toBe(0);
    expect(compareVersions('0.5.0', '0.5.1')).toBe(-1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(0);
  });

  it('offers only a newer release, with its page on GitHub', () => {
    expect(parseLatestRelease(release('v0.6.0'), '0.5.0')).toEqual({
      version: '0.6.0',
      notes: '* History shows this device.',
      url: 'https://github.com/Stevesibilia/rpg-promptbook/releases/tag/v0.6.0',
    });
    expect(parseLatestRelease(release('v0.5.0'), '0.5.0')).toBeNull();
    expect(parseLatestRelease(release('v0.4.2'), '0.5.0')).toBeNull();
    // A page elsewhere is not opened: the release's own page instead.
    expect(parseLatestRelease(release('v0.6.0', { html_url: 'https://evil.example/x' }), '0.5.0')?.url).toBe(
      'https://github.com/Stevesibilia/rpg-promptbook/releases/tag/v0.6.0',
    );
    expect(() => parseLatestRelease({ tag_name: 'nightly' }, '0.5.0')).toThrow(/Unexpected release tag/);
  });

  it("reads electron-updater's notes, HTML or one per version", () => {
    expect(notesOf('<ul><li>Uno</li></ul>')).toBe('<ul><li>Uno</li></ul>');
    expect(notesOf([{ version: '0.6.0', note: 'Uno' }, { version: '0.5.1', note: 'Due' }])).toBe('Uno\nDue');
    expect(notesOf(null)).toBe('');
  });
});

describe('the updater', () => {
  it('is off and checks nothing when not packaged', async () => {
    const { updater, states, lookups, auto } = setup({ packaged: false, kind: 'self' });
    updater.start();
    await updater.check();
    expect(updater.state).toEqual({ kind: 'off' });
    expect(states).toEqual([]);
    expect(lookups).toEqual([]);
    expect(auto.checks).toBe(0);
  });

  it('on a Mac, offers a newer release and opens its page', async () => {
    const { updater, states, opened, lookups, auto } = setup({ answer: () => Response.json(release('v0.6.0')) });
    await updater.check();
    expect(lookups[0]!.url).toBe(LATEST_RELEASE_API);
    expect(new Headers(lookups[0]!.init?.headers).get('user-agent')).toBe('Promptbook/0.5.0');
    expect(states).toEqual([
      { kind: 'idle', checking: true },
      {
        kind: 'available',
        version: '0.6.0',
        notes: '* History shows this device.',
        url: 'https://github.com/Stevesibilia/rpg-promptbook/releases/tag/v0.6.0',
      },
    ]);
    await updater.openRelease();
    expect(opened).toEqual(['https://github.com/Stevesibilia/rpg-promptbook/releases/tag/v0.6.0']);
    // Restart now means nothing without electron-updater.
    updater.restart();
    expect(auto.checks + auto.installs).toBe(0);
  });

  it('on a Mac, stays idle when current, with no release yet, or when GitHub fails', async () => {
    for (const answer of [
      () => Response.json(release('v0.5.0')),
      () => new Response('{}', { status: 404 }),
      () => new Response('', { status: 502 }),
      () => Promise.reject(new TypeError('fetch failed')),
    ]) {
      const { updater } = setup({ answer });
      await updater.check();
      expect(updater.state).toEqual({ kind: 'idle', checking: false });
    }
  });

  it('checks at start and every 6 hours', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { updater, lookups } = setup();
    stop = () => updater.stop();
    // vi.waitFor would move the faked clock on.
    const settle = async () => {
      for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
    };
    updater.start();
    await settle();
    expect(lookups).toHaveLength(1);
    vi.advanceTimersByTime(CHECK_EVERY_MS - 1);
    await settle();
    expect(lookups).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await settle();
    expect(lookups).toHaveLength(2);
  });

  it('on Windows and the AppImage, downloads, shows the progress, then offers Restart now', async () => {
    const { updater, states, auto, lookups } = setup({ kind: 'self' });
    auto.onCheck = (u) => {
      u.emit('update-available', { version: '0.6.0', releaseNotes: '<p>Novità</p>' });
      u.emit('download-progress', { percent: 62.4 });
    };
    stop = () => updater.stop();
    updater.start();
    expect(auto.autoDownload).toBe(true);
    expect(auto.autoInstallOnAppQuit).toBe(true);
    await vi.waitFor(() => expect(updater.state).toEqual({ kind: 'downloading', version: '0.6.0', percent: 62.4 }));
    auto.emit('update-downloaded', { version: '0.6.0', releaseNotes: null });
    expect(updater.state).toEqual({ kind: 'ready', version: '0.6.0', notes: '<p>Novità</p>' });
    expect(states.map((s) => s.kind)).toEqual(['idle', 'downloading', 'downloading', 'ready']);
    expect(lookups).toEqual([]);

    // Ready: no new check, and Restart now installs.
    await updater.check();
    expect(auto.checks).toBe(1);
    await updater.openRelease();
    updater.restart();
    expect(auto.installs).toBe(1);
  });

  it('on Windows, goes back to idle after a failed download, and to the release page when it cannot check', async () => {
    const { updater, auto } = setup({ kind: 'self', answer: () => Response.json(release('v0.6.0')) });
    auto.onCheck = (u) => u.emit('update-available', { version: '0.6.0' });
    stop = () => updater.stop();
    updater.start();
    await vi.waitFor(() => expect(updater.state.kind).toBe('downloading'));
    // The check at start is over; the download goes on.
    await new Promise((resolve) => setTimeout(resolve, 0));
    auto.emit('error', new Error('net::ERR_CONNECTION_RESET'));
    expect(updater.state).toEqual({ kind: 'idle', checking: false });

    auto.onCheck = () => {
      throw new Error('Cannot find latest.yml');
    };
    await updater.check();
    expect(updater.state).toMatchObject({ kind: 'available', version: '0.6.0' });
  });

  it('runs one check at a time', async () => {
    let answer!: (r: Response) => void;
    const { updater, lookups } = setup({ answer: () => new Promise<Response>((resolve) => (answer = resolve)) });
    const first = updater.check();
    const second = updater.check();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(lookups).toHaveLength(1));
    answer(Response.json(release('v0.5.0')));
    await first;
    expect(updater.state).toEqual({ kind: 'idle', checking: false });
  });
});
