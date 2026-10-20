import type { UpdatesState } from 'promptbook-web/src/platform/bridge.js';

// Updates from GitHub Releases (desktop-app design decision 14), after
// CueBard's electron/updater.js. Windows and the AppImage update themselves
// with electron-updater: the download starts on its own, then Restart now
// (or the install on quit). A Mac build is unsigned, and Squirrel.Mac refuses
// an unsigned update; the deb package has no updater: both ask GitHub's
// latest-release API and offer the release page. Checks at start, every 6
// hours and on Check for updates; nothing when not packaged.

export const REPO = 'Stevesibilia/rpg-promptbook';
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
export const CHECK_EVERY_MS = 6 * 3_600_000;
const LOOKUP_TIMEOUT_MS = 10_000;

export type InstallKind = 'self' | 'manual';

// Windows (NSIS) and the AppImage, which electron-updater names in
// APPIMAGE, install updates; a Mac and the deb package do not.
export function installKind(platform: NodeJS.Platform, env: Record<string, string | undefined>): InstallKind {
  return platform === 'win32' || (platform === 'linux' && !!env.APPIMAGE) ? 'self' : 'manual';
}

// 1 when a is newer than b, -1 when older, 0 when the same. «0.5.0», «v0.5»;
// a pre-release suffix is ignored (the latest-release API never answers one).
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/, '')
      .split(/[-+]/)[0]!
      .split('.')
      .map((n) => Number(n) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export interface ReleaseOffer {
  version: string;
  notes: string;
  url: string;
}

// The latest-release API's answer as an offer, or null when it is not newer
// than the running version. Throws on an answer that names no version.
export function parseLatestRelease(release: unknown, current: string): ReleaseOffer | null {
  const r = release as { tag_name?: unknown; body?: unknown; html_url?: unknown } | null;
  const version = typeof r?.tag_name === 'string' ? r.tag_name.replace(/^v/, '') : '';
  if (!/^\d+(\.\d+)*$/.test(version)) throw new Error(`Unexpected release tag: ${JSON.stringify(r?.tag_name)}`);
  if (compareVersions(version, current) <= 0) return null;
  const url = typeof r?.html_url === 'string' && r.html_url.startsWith(`https://github.com/${REPO}/`) ? r.html_url : releasePage(version);
  return { version, notes: typeof r?.body === 'string' ? r.body : '', url };
}

export const releasePage = (version: string) => `${RELEASES_PAGE}/tag/v${version}`;

// electron-updater's notes: HTML, or one entry per version.
export function notesOf(releaseNotes: unknown): string {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes.map((entry) => (entry as { note?: unknown })?.note).filter((n) => typeof n === 'string').join('\n');
  }
  return typeof releaseNotes === 'string' ? releaseNotes : '';
}

// The part of electron-updater's autoUpdater used here.
export interface AutoUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdaterOptions {
  packaged: boolean;
  kind: InstallKind;
  // app.getVersion(), the packaged app's version.
  version: string;
  // Read only where the app installs updates itself.
  autoUpdater: () => AutoUpdater;
  emit: (state: UpdatesState) => void;
  openExternal: (url: string) => void | Promise<void>;
  fetch?: typeof fetch;
  log?: (message: string, error?: unknown) => void;
}

export class Updater {
  private current: UpdatesState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private checking: Promise<void> | null = null;
  private updater: AutoUpdater | null = null;
  // The version being downloaded, and its notes, while electron-updater works.
  private incoming: { version: string; notes: string } | null = null;

  constructor(private readonly options: UpdaterOptions) {
    this.current = options.packaged ? { kind: 'idle', checking: false } : { kind: 'off' };
  }

  get state(): UpdatesState {
    return this.current;
  }

  private set(state: UpdatesState): void {
    this.current = state;
    this.options.emit(state);
  }

  private log(message: string, error?: unknown): void {
    (this.options.log ?? ((m, e) => console.warn(m, e ?? '')))(message, error);
  }

  // At start, then every 6 hours. Nothing when not packaged.
  start(): void {
    if (!this.options.packaged || this.timer) return;
    if (this.options.kind === 'self') this.configure();
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private configure(): void {
    const u = this.options.autoUpdater();
    this.updater = u;
    u.autoDownload = true;
    u.autoInstallOnAppQuit = true;
    u.on('update-available', (info: { version: string; releaseNotes?: unknown }) => {
      this.incoming = { version: info.version, notes: notesOf(info.releaseNotes) };
      this.set({ kind: 'downloading', version: info.version, percent: 0 });
    });
    u.on('download-progress', (progress: { percent: number }) => {
      if (!this.incoming || this.current.kind === 'ready') return;
      this.set({ kind: 'downloading', version: this.incoming.version, percent: progress.percent });
    });
    u.on('update-downloaded', (info: { version: string; releaseNotes?: unknown }) => {
      const notes = notesOf(info.releaseNotes) || this.incoming?.notes || '';
      this.incoming = null;
      this.set({ kind: 'ready', version: info.version, notes });
    });
    // A failed download: the next check tries again.
    u.on('error', (error: unknown) => {
      this.log('The update failed:', error);
      if (this.current.kind === 'downloading') {
        this.incoming = null;
        this.set({ kind: 'idle', checking: false });
      }
    });
  }

  // One check at a time; answers once it is done. A download in progress or
  // an update ready to install is left alone.
  check(): Promise<void> {
    if (!this.options.packaged) return Promise.resolve();
    if (this.current.kind === 'downloading' || this.current.kind === 'ready') return Promise.resolve();
    this.checking ??= this.run().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  private async run(): Promise<void> {
    const before = this.current;
    if (before.kind === 'idle') this.set({ kind: 'idle', checking: true });
    if (this.updater) {
      try {
        await this.updater.checkForUpdates();
        // update-available moved on to downloading; otherwise nothing new.
        if (this.current.kind === 'idle') this.set({ kind: 'idle', checking: false });
        return;
      } catch (error) {
        // As CueBard does: the release page is still worth offering.
        this.log('The updater could not check; asking GitHub for the latest release.', error);
      }
    }
    try {
      const offer = await this.latestRelease();
      if (offer) this.set({ kind: 'available', ...offer });
      else if (this.current.kind === 'idle') this.set({ kind: 'idle', checking: false });
    } catch (error) {
      this.log('Looking up the latest release failed:', error);
      this.set(before.kind === 'available' ? before : { kind: 'idle', checking: false });
    }
  }

  private async latestRelease(): Promise<ReleaseOffer | null> {
    const response = await (this.options.fetch ?? fetch)(LATEST_RELEASE_API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `Promptbook/${this.options.version}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    // No release published yet.
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseLatestRelease(await response.json(), this.options.version);
  }

  // Restart now: only with an update downloaded.
  restart(): void {
    if (this.current.kind === 'ready' && this.updater) this.updater.quitAndInstall();
  }

  // Download, or Full release notes on GitHub.
  async openRelease(): Promise<void> {
    const s = this.current;
    const url = s.kind === 'available' ? s.url : s.kind === 'ready' ? releasePage(s.version) : `${RELEASES_PAGE}/latest`;
    await this.options.openExternal(url);
  }
}
