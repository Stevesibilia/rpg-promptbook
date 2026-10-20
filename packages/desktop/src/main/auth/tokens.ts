// The app's tokens from the server's authorization server (desktop-app
// design decision 8). The access token lives in memory only and is
// refreshed 5 minutes before it expires, or when the server refuses it; one
// refresh at a time, since each one rotates the refresh token and a second
// use of the old one would revoke the grant. The refresh token is kept
// encrypted with safeStorage, or in memory only when no keychain is there.

export const CLIENT_ID = 'promptbook-desktop';
export const REFRESH_EARLY_MS = 5 * 60_000;
const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

export interface SecretStore {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

// Where the encrypted refresh token is kept: the account's kv.
export interface TokenStorage {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// No usable session: never signed in, signed out, or the server refused the
// refresh.
export class SignedOutError extends Error {
  constructor() {
    super('Signed out.');
  }
}

// The server could not be reached.
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('The server cannot be reached.', { cause });
  }
}

export interface TokensOptions {
  server: string;
  fetch?: typeof fetch;
  secrets: SecretStore;
  now?: () => number;
  // The server refused the refresh token: the grant is revoked or expired.
  onEnded: () => void;
}

const isTokenResponse = (v: unknown): v is TokenResponse => {
  const t = v as Partial<TokenResponse> | null;
  return (
    typeof t?.access_token === 'string' &&
    typeof t.refresh_token === 'string' &&
    typeof t.expires_in === 'number' &&
    t.expires_in > 0
  );
};

export class Tokens {
  private access: { value: string; expiresAt: number } | null = null;
  private refreshToken: string | null = null;
  private storage: TokenStorage | null = null;
  private inflight: Promise<string> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
  private stopped = false;
  // The rotated refresh token could not be written (a disk error): tried
  // again before the store closes.
  private unsaved = false;
  // Bumped by clear(): an answer to a request made before it is dropped.
  private generation = 0;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: TokensOptions) {
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  get server(): string {
    return this.options.server;
  }

  get hasSession(): boolean {
    return this.refreshToken !== null;
  }

  // The refresh token survives a relaunch.
  get remembered(): boolean {
    return this.options.secrets.isEncryptionAvailable();
  }

  // Tokens kept from an earlier run; false when there are none or they cannot
  // be decrypted.
  restore(storage: TokenStorage): boolean {
    this.storage = storage;
    const stored = storage.get();
    if (!stored) return false;
    try {
      this.refreshToken = this.options.secrets.decryptString(Buffer.from(stored, 'base64'));
      return true;
    } catch {
      storage.clear();
      return false;
    }
  }

  // Where to keep the refresh token once the account is known; the one held
  // now is written there at once.
  attachStorage(storage: TokenStorage): void {
    this.storage = storage;
    this.persist();
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      if (!this.refreshToken || !this.remembered) this.storage.clear();
      else this.storage.set(this.options.secrets.encryptString(this.refreshToken).toString('base64'));
      this.unsaved = false;
    } catch {
      this.unsaved = true;
    }
  }

  private accept(t: TokenResponse): string {
    this.access = { value: t.access_token, expiresAt: this.now() + t.expires_in * 1000 };
    this.refreshToken = t.refresh_token;
    this.persist();
    this.retryDelay = RETRY_MIN_MS;
    if (!this.stopped) this.schedule(Math.max(0, this.access.expiresAt - REFRESH_EARLY_MS - this.now()));
    return t.access_token;
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh().catch((error: unknown) => {
        if (error instanceof NetworkError) {
          this.schedule(this.retryDelay);
          this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
        }
      });
    }, ms);
  }

  private async post(path: string, form: Record<string, string>): Promise<Response> {
    try {
      return await this.fetch(`${this.options.server}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new NetworkError(error);
    }
  }

  // The authorization code from the loopback callback, for tokens.
  async exchange(code: string, verifier: string, redirectUri: string): Promise<string> {
    const generation = this.generation;
    const response = await this.post('/api/oauth/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
      resource: `${this.options.server}/api`,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !isTokenResponse(body)) {
      const error = (body as { error?: string } | null)?.error ?? `HTTP ${response.status}`;
      throw new Error(`The server refused the sign-in (${error}).`);
    }
    if (generation !== this.generation) throw new SignedOutError();
    return this.accept(body);
  }

  // A valid access token, refreshed first when it expires within 5 minutes.
  async accessToken(): Promise<string> {
    if (this.access && this.access.expiresAt - REFRESH_EARLY_MS > this.now()) return this.access.value;
    return this.refresh();
  }

  // The server refused `value`: the next accessToken() refreshes.
  invalidate(value: string): void {
    if (this.access?.value === value) this.access = null;
  }

  refresh(): Promise<string> {
    if (!this.refreshToken) return Promise.reject(new SignedOutError());
    this.inflight ??= this.doRefresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async doRefresh(): Promise<string> {
    const generation = this.generation;
    const response = await this.post('/api/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken!,
      client_id: CLIENT_ID,
      resource: `${this.options.server}/api`,
    });
    const body: unknown = await response.json().catch(() => null);
    if (generation !== this.generation) throw new SignedOutError();
    if (response.ok && isTokenResponse(body)) return this.accept(body);
    // invalid_grant: revoked, expired or reused.
    if (response.status === 400 || response.status === 401) {
      this.forget();
      this.options.onEnded();
      throw new SignedOutError();
    }
    throw new NetworkError(new Error(`HTTP ${response.status}`));
  }

  // The session ended without the refresh being refused (the server refused
  // a fresh access token): the tokens are forgotten here, nothing is sent.
  clear(): void {
    this.forget();
  }

  private forget(): void {
    this.generation += 1;
    this.access = null;
    this.refreshToken = null;
    this.inflight = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.storage?.clear();
  }

  // Sign-out: the grant revoked on the server when it answers (best effort),
  // and the tokens forgotten here either way.
  async signOut(): Promise<void> {
    const token = this.refreshToken;
    this.forget();
    if (!token) return;
    try {
      await this.post('/api/oauth/revoke', { token, client_id: CLIENT_ID });
    } catch {
      // Offline: the refresh token is forgotten, and lapses on the server.
    }
  }

  // Before the store closes: a refresh in flight is waited for (up to
  // `ms`), so the refresh token it rotates is written; the old one would be
  // refused at the next start, and the grant revoked with it.
  async settle(ms = 5_000): Promise<void> {
    if (this.inflight) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        this.inflight.catch(() => {}),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, ms);
        }),
      ]);
      clearTimeout(timer);
    }
    if (this.unsaved) this.persist();
  }

  // Timers stopped, tokens kept (quit, or tokens replaced by a new sign-in).
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
