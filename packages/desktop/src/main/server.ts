import { NetworkError, SignedOutError } from './auth/tokens.js';

// REST calls from main to the server with the app's bearer token (desktop-app
// design decisions 7 and 8). A 401 refreshes the token and tries once more; a
// second 401 ends the session. A network failure is an OfflineError, which
// the router answers as 503 offline.

export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super('Needs the server.', { cause });
  }
}

export interface AccessTokens {
  accessToken(): Promise<string>;
  invalidate(value: string): void;
}

export interface ServerRequest {
  method: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

const TIMEOUT_MS = 30_000;

export class ServerClient {
  constructor(
    readonly origin: string,
    private readonly tokens: AccessTokens,
    // A 401 that survived a refresh: the grant no longer works.
    private readonly onSessionEnded: () => void,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async token(): Promise<string> {
    try {
      return await this.tokens.accessToken();
    } catch (error) {
      if (error instanceof NetworkError) throw new OfflineError(error);
      throw error instanceof SignedOutError ? error : new SignedOutError();
    }
  }

  private async send(path: string, init: ServerRequest, token: string): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.origin}${path}`, {
        method: init.method,
        headers: { accept: 'application/json', ...init.headers, authorization: `Bearer ${token}` },
        ...(init.body !== undefined ? { body: init.body } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new OfflineError(error);
    }
  }

  // Throws OfflineError when the server cannot be reached and SignedOutError
  // with no usable session.
  async request(path: string, init: ServerRequest = { method: 'GET' }): Promise<Response> {
    const first = await this.token();
    const response = await this.send(path, init, first);
    if (response.status !== 401) return response;
    this.tokens.invalidate(first);
    const second = await this.token();
    const retried = await this.send(path, init, second);
    if (retried.status === 401) {
      this.tokens.invalidate(second);
      this.onSessionEnded();
    }
    return retried;
  }

  // The JSON of a 2xx answer; anything else throws HttpError.
  async json<T>(path: string, init: ServerRequest = { method: 'GET' }): Promise<T> {
    const response = await this.request(path, init);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new HttpError(response.status, body);
    return body as T;
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`The server answered ${status}.`);
  }

  get code(): string | null {
    return (this.body as { error?: string } | null)?.error ?? null;
  }
}
