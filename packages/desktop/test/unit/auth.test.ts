import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceName, LoopbackSignIn, type LoopbackOptions } from '../../src/main/auth/loopback.js';
import { NetworkError, SignedOutError, Tokens, type SecretStore, type TokenStorage } from '../../src/main/auth/tokens.js';
import { fakeServer, sendJson } from './helpers.js';

// Sign-in through the browser against a fake authorization server, and the
// tokens it gives (desktop-app design decisions 8 and 17).

const SERVER = 'https://promptbook.example';

// safeStorage as on a computer with a keychain, or without one.
export const secrets = (available = true): SecretStore => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from(`enc:${plain}`),
  decryptString: (encrypted) => {
    const text = encrypted.toString();
    if (!text.startsWith('enc:')) throw new Error('not ours');
    return text.slice(4);
  },
});

export const tokenResponse = (n: number, expiresIn = 3600) => ({
  access_token: `pb_at_${n}`,
  token_type: 'Bearer',
  expires_in: expiresIn,
  refresh_token: `pb_rt_${n}`,
  scope: 'app',
});

async function signIn(overrides: Partial<LoopbackOptions> = {}) {
  let opened = '';
  const exchanged: { code: string; verifier: string; redirectUri: string }[] = [];
  const loopback = await LoopbackSignIn.start({
    server: SERVER,
    deviceName: 'Studio',
    open: (url) => {
      opened = url;
    },
    exchange: async (code, verifier, redirectUri) => {
      exchanged.push({ code, verifier, redirectUri });
      return { displayName: 'Stefano', signIn: 'oidc' };
    },
    ...overrides,
  });
  const url = new URL(opened);
  return { loopback, url, exchanged, redirect: url.searchParams.get('redirect_uri')! };
}

// The browser coming back, with Host as a browser sends it.
function get(target: string, host?: string): Promise<{ status: number; body: string }> {
  const url = new URL(target);
  return new Promise((resolve, reject) => {
    const req = request(
      { host: url.hostname, port: url.port, path: url.pathname + url.search, headers: host ? { host } : {} },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('loopback sign-in', () => {
  it('opens the authorize URL of the first-party client with PKCE, the app resource and the computer', async () => {
    const { loopback, url, redirect } = await signIn();
    expect(`${url.origin}${url.pathname}`).toBe(`${SERVER}/authorize`);
    const p = Object.fromEntries(url.searchParams);
    expect(p).toMatchObject({
      response_type: 'code',
      client_id: 'promptbook-desktop',
      code_challenge_method: 'S256',
      resource: `${SERVER}/api`,
      scope: 'app',
      device_name: 'Studio',
    });
    expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(p.state).toMatch(/^[\w-]{22}$/);
    expect(p.code_challenge).toMatch(/^[\w-]{43}$/);
    loopback.cancel();
  });

  it('answers Signed in to the right state, after trading the code with its verifier', async () => {
    const { loopback, url, redirect, exchanged } = await signIn();
    const state = url.searchParams.get('state')!;
    const page = await get(`${redirect}?code=c-1&state=${state}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain('Signed in to Promptbook on this computer. You can close this tab.');
    expect(page.body).toContain('promptbook.example · Stefano · single sign-on');
    expect(await loopback.result).toEqual({ ok: true, info: { displayName: 'Stefano', signIn: 'oidc' } });
    const challenge = createHash('sha256').update(exchanged[0]!.verifier).digest('base64url');
    expect(challenge).toBe(url.searchParams.get('code_challenge'));
    expect(exchanged[0]).toMatchObject({ code: 'c-1', redirectUri: redirect });
    // One answer: the listener is closed.
    await expect(get(`${redirect}?code=c-2&state=${state}`)).rejects.toThrow();
  });

  it('refuses a wrong state and keeps waiting for the right one', async () => {
    const { loopback, url, redirect, exchanged } = await signIn();
    const page = await get(`${redirect}?code=c-1&state=forged`);
    expect(page.status).toBe(400);
    expect(page.body).toContain('Sign-in did not finish');
    expect(page.body).toContain('Go back to Promptbook and try again.');
    expect(exchanged).toEqual([]);
    const right = await get(`${redirect}?code=c-2&state=${url.searchParams.get('state')}`);
    expect(right.body).toContain('Signed in');
    expect(await loopback.result).toMatchObject({ ok: true });
    expect(exchanged.map((e) => e.code)).toEqual(['c-2']);
  });

  it('does not say Signed in when the app cancelled during the exchange', async () => {
    let finish: () => void = () => {};
    const { loopback, url, redirect } = await signIn({
      exchange: () =>
        new Promise((resolve) => {
          finish = () => resolve({ displayName: 'Stefano', signIn: 'oidc' });
        }),
    });
    const page = get(`${redirect}?code=c&state=${url.searchParams.get('state')}`);
    await new Promise((r) => setTimeout(r, 50));
    loopback.cancel();
    finish();
    expect((await page).body).toContain('Sign-in did not finish');
    expect(await loopback.result).toMatchObject({ ok: false, reason: 'cancelled' });
  });

  it('reports a refusal from the server and a failed exchange', async () => {
    const denied = await signIn();
    await get(`${denied.redirect}?error=access_denied&state=${denied.url.searchParams.get('state')}`);
    expect(await denied.loopback.result).toMatchObject({ ok: false, reason: 'denied' });

    const failing = await signIn({
      exchange: () => Promise.reject(new Error('The server refused the sign-in (invalid_grant).')),
    });
    const page = await get(`${failing.redirect}?code=x&state=${failing.url.searchParams.get('state')}`);
    expect(page.body).toContain('Sign-in did not finish');
    expect(await failing.loopback.result).toMatchObject({ ok: false, reason: 'error', message: expect.stringContaining('invalid_grant') });
  });

  it('ignores other paths and other hosts', async () => {
    const { loopback, url, redirect } = await signIn();
    const port = new URL(redirect).port;
    expect((await get(`http://127.0.0.1:${port}/favicon.ico`)).status).toBe(404);
    expect((await get(`${redirect}?code=c&state=${url.searchParams.get('state')}`, 'evil.example')).status).toBe(404);
    loopback.cancel();
    expect(await loopback.result).toMatchObject({ ok: false, reason: 'cancelled' });
    await expect(get(redirect)).rejects.toThrow();
  });

  it('gives up after its timeout', async () => {
    const { loopback } = await signIn({ timeoutMs: 50 });
    expect(await loopback.result).toEqual({
      ok: false,
      reason: 'timeout',
      message: 'The browser window was closed, or it took more than 5 minutes.',
    });
  });

  it('reopens the same URL', async () => {
    const { loopback, url } = await signIn();
    let again = '';
    const reopened = await LoopbackSignIn.start({
      server: SERVER,
      deviceName: 'Studio',
      open: (u) => {
        again = again ? `${again} ${u}` : u;
      },
      exchange: () => Promise.reject(new Error('unused')),
    });
    await reopened.reopen();
    const [first, second] = again.split(' ');
    expect(first).toBe(second);
    expect(new URL(first!).searchParams.get('state')).not.toBe(url.searchParams.get('state'));
    loopback.cancel();
    reopened.cancel();
  });

  it('names the computer in 1 to 80 printable characters', () => {
    expect(deviceName('Stefanos-MacBook-Pro.local')).toBe('Stefanos-MacBook-Pro');
    expect(deviceName('\u0007\u0000')).toBe('Computer');
    expect(deviceName('x'.repeat(100))).toHaveLength(80);
  });
});

const memory = (): TokenStorage & { value: string | null } => {
  const s = {
    value: null as string | null,
    get: () => s.value,
    set: (v: string) => {
      s.value = v;
    },
    clear: () => {
      s.value = null;
    },
  };
  return s;
};

describe('tokens', () => {
  afterEach(() => vi.useRealTimers());

  async function authServer(answer: (form: URLSearchParams, n: number) => [number, unknown]) {
    let n = 0;
    return fakeServer((req, res) => {
      const form = new URLSearchParams(req.body);
      n += 1;
      const [status, body] = answer(form, n);
      sendJson(res, status, body);
    });
  }

  it('exchanges the code with the app resource and keeps the refresh token encrypted', async () => {
    const as = await authServer((_f, n) => [200, tokenResponse(n)]);
    const storage = memory();
    const tokens = new Tokens({ server: as.origin, secrets: secrets(), onEnded: () => {} });
    tokens.attachStorage(storage);
    expect(await tokens.exchange('code-1', 'verifier', 'http://127.0.0.1:1/callback')).toBe('pb_at_1');
    const form = new URLSearchParams(as.requests[0]!.body);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: 'http://127.0.0.1:1/callback',
      client_id: 'promptbook-desktop',
      code_verifier: 'verifier',
      resource: `${as.origin}/api`,
    });
    expect(as.requests[0]!.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(Buffer.from(storage.value!, 'base64').toString()).toBe('enc:pb_rt_1');
    // A relaunch reads it back.
    const again = new Tokens({ server: as.origin, secrets: secrets(), onEnded: () => {} });
    expect(again.restore(storage)).toBe(true);
    expect(await again.accessToken()).toBe('pb_at_2');
    expect(new URLSearchParams(as.requests[1]!.body).get('refresh_token')).toBe('pb_rt_1');
    await as.close();
  });

  it('keeps the refresh token in memory only without a keychain', async () => {
    const as = await authServer((_f, n) => [200, tokenResponse(n)]);
    const storage = memory();
    storage.value = 'stale';
    const tokens = new Tokens({ server: as.origin, secrets: secrets(false), onEnded: () => {} });
    tokens.attachStorage(storage);
    await tokens.exchange('c', 'v', 'r');
    expect(tokens.remembered).toBe(false);
    expect(storage.value).toBeNull();
    expect(tokens.hasSession).toBe(true);
    await as.close();
  });

  it('refreshes 5 minutes before expiry, one refresh at a time', async () => {
    let now = 1_000_000;
    const as = await authServer((_f, n) => [200, tokenResponse(n, 3600)]);
    const tokens = new Tokens({ server: as.origin, secrets: secrets(), now: () => now, onEnded: () => {} });
    await tokens.exchange('c', 'v', 'r');
    expect(await tokens.accessToken()).toBe('pb_at_1');
    now += 55 * 60_000 + 1;
    const [a, b] = await Promise.all([tokens.accessToken(), tokens.accessToken()]);
    expect([a, b]).toEqual(['pb_at_2', 'pb_at_2']);
    expect(as.requests.filter((r) => r.body.includes('grant_type=refresh_token'))).toHaveLength(1);
    tokens.stop();
    await as.close();
  });

  it('refreshes after the server refused the access token', async () => {
    const as = await authServer((_f, n) => [200, tokenResponse(n)]);
    const tokens = new Tokens({ server: as.origin, secrets: secrets(), onEnded: () => {} });
    await tokens.exchange('c', 'v', 'r');
    tokens.invalidate('pb_at_1');
    expect(await tokens.accessToken()).toBe('pb_at_2');
    tokens.stop();
    await as.close();
  });

  it('ends the session when the refresh is refused, and only then', async () => {
    let refuse = false;
    const as = await authServer((_f, n) =>
      refuse ? [400, { error: 'invalid_grant', error_description: 'revoked' }] : [200, tokenResponse(n)],
    );
    const ended = vi.fn();
    const storage = memory();
    const tokens = new Tokens({ server: as.origin, secrets: secrets(), onEnded: ended });
    tokens.attachStorage(storage);
    await tokens.exchange('c', 'v', 'r');
    refuse = true;
    await expect(tokens.refresh()).rejects.toBeInstanceOf(SignedOutError);
    expect(ended).toHaveBeenCalledOnce();
    expect(storage.value).toBeNull();
    expect(tokens.hasSession).toBe(false);
    await expect(tokens.accessToken()).rejects.toBeInstanceOf(SignedOutError);
    await as.close();
  });

  it('leaves the session alone when the server cannot be reached', async () => {
    const as = await authServer((_f, n) => [200, tokenResponse(n)]);
    const ended = vi.fn();
    const tokens = new Tokens({ server: as.origin, secrets: secrets(), onEnded: ended });
    await tokens.exchange('c', 'v', 'r');
    await as.close();
    tokens.invalidate('pb_at_1');
    await expect(tokens.accessToken()).rejects.toBeInstanceOf(NetworkError);
    expect(ended).not.toHaveBeenCalled();
    expect(tokens.hasSession).toBe(true);
    tokens.stop();
  });

  it('waits for a refresh in flight before the store closes, and writes what it rotated', async () => {
    let release: () => void = () => {};
    const as = await fakeServer(async (req, res) => {
      if (new URLSearchParams(req.body).get('grant_type') === 'refresh_token') await new Promise<void>((r) => (release = r));
      sendJson(res, 200, tokenResponse(as.requests.length));
    });
    const storage = memory();
    const tokens = new Tokens({ server: as.origin, secrets: secrets(), onEnded: () => {} });
    tokens.attachStorage(storage);
    await tokens.exchange('c', 'v', 'r');
    void tokens.refresh().catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    const settled = tokens.settle(2_000);
    release();
    await settled;
    tokens.stop();
    expect(Buffer.from(storage.value!, 'base64').toString()).toBe('enc:pb_rt_2');
    await as.close();
  });

  it('signs out by revoking the refresh token, and drops a refresh that answers after it', async () => {
    let release: () => void = () => {};
    const as = await fakeServer(async (req, res) => {
      const form = new URLSearchParams(req.body);
      if (req.path === '/api/oauth/revoke') return sendJson(res, 200, {});
      if (form.get('grant_type') === 'refresh_token') await new Promise<void>((r) => (release = r));
      sendJson(res, 200, tokenResponse(as.requests.length));
    });
    const storage = memory();
    const tokens = new Tokens({ server: as.origin, secrets: secrets(), onEnded: () => {} });
    tokens.attachStorage(storage);
    await tokens.exchange('c', 'v', 'r');
    const refreshing = tokens.refresh();
    await new Promise((r) => setTimeout(r, 50));
    await tokens.signOut();
    release();
    await expect(refreshing).rejects.toBeInstanceOf(SignedOutError);
    expect(storage.value).toBeNull();
    expect(tokens.hasSession).toBe(false);
    const revoke = as.requests.find((r) => r.path === '/api/oauth/revoke')!;
    expect(Object.fromEntries(new URLSearchParams(revoke.body))).toEqual({
      token: 'pb_rt_1',
      client_id: 'promptbook-desktop',
    });
    await as.close();
  });
});
