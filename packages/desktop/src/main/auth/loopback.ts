import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CLIENT_ID } from './tokens.js';

// Sign-in through the system browser (desktop-app design decision 8, RFC
// 8252): a listener on 127.0.0.1 at a random port, PKCE S256 and a random
// state, the server's /authorize opened in the default browser. One callback
// with the right state is answered, with the Signed in page or the Sign-in
// did not finish page; then the listener closes. It gives up after 5
// minutes, or on Cancel.

export const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

export interface SignedIn {
  displayName: string;
  signIn: 'oidc' | 'password';
}

export type LoopbackResult =
  | { ok: true; info: SignedIn }
  | { ok: false; reason: 'timeout' | 'denied' | 'error' | 'cancelled'; message: string };

export interface LoopbackOptions {
  server: string;
  deviceName: string;
  // Opens the URL in the browser; under PROMPTBOOK_E2E it hands it to the test.
  open: (url: string) => void | Promise<void>;
  // Trades the code for tokens and answers who signed in.
  exchange: (code: string, verifier: string, redirectUri: string) => Promise<SignedIn>;
  timeoutMs?: number;
}

const base64url = (bytes: Buffer) => bytes.toString('base64url');

// os.hostname(), as the grant's device_name: 1 to 80 printable characters.
export function deviceName(hostname: string): string {
  const printable = [...hostname.replace(/\.local$/i, '')].filter((c) => /^[\p{L}\p{N}\p{P}\p{S} ]$/u.test(c));
  const name = printable.join('').trim().slice(0, 80).trim();
  return name || 'Computer';
}

export class LoopbackSignIn {
  readonly url: string;
  readonly result: Promise<LoopbackResult>;
  private finish!: (result: LoopbackResult) => void;
  private done = false;
  private timer: ReturnType<typeof setTimeout>;
  private handling = false;

  private constructor(
    private readonly server: Server,
    private readonly options: LoopbackOptions,
    private readonly port: number,
    private readonly verifier: string,
    private readonly state: string,
  ) {
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: this.redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      resource: `${options.server}/api`,
      scope: 'app',
      device_name: options.deviceName,
    });
    this.url = `${options.server}/authorize?${params}`;
    this.result = new Promise((resolve) => {
      this.finish = resolve;
    });
    this.timer = setTimeout(
      () =>
        this.end({
          ok: false,
          reason: 'timeout',
          message: 'The browser window was closed, or it took more than 5 minutes.',
        }),
      options.timeoutMs ?? SIGN_IN_TIMEOUT_MS,
    );
    server.on('request', (req, res) => void this.handle(req, res));
  }

  get redirectUri(): string {
    return `http://127.0.0.1:${this.port}/callback`;
  }

  static async start(options: LoopbackOptions): Promise<LoopbackSignIn> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    const signIn = new LoopbackSignIn(server, options, port, base64url(randomBytes(32)), base64url(randomBytes(16)));
    await signIn.reopen();
    return signIn;
  }

  // "Open the browser again": the same URL.
  async reopen(): Promise<void> {
    if (!this.done) await this.options.open(this.url);
  }

  cancel(): void {
    this.end({ ok: false, reason: 'cancelled', message: 'Sign-in cancelled.' });
  }

  private end(result: LoopbackResult): void {
    if (this.done) return;
    this.done = true;
    clearTimeout(this.timer);
    // An answer in progress still gets its page; idle connections go.
    this.server.close();
    this.server.closeIdleConnections();
    this.finish(result);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.redirectUri);
    // Only this listener's own address: a page that rebinds a name to
    // 127.0.0.1 sends its own Host.
    const host = req.headers.host;
    if (
      req.method !== 'GET' ||
      url.pathname !== '/callback' ||
      (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`)
    ) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    if (this.done || this.handling) {
      res.writeHead(409, { 'content-type': 'text/plain; charset=utf-8' }).end('This sign-in is over.');
      return;
    }
    // Not this sign-in's answer (a page probing loopback ports): refused,
    // and the listener keeps waiting for the real one.
    if (url.searchParams.get('state') !== this.state) {
      send(res, failedPage(), 400);
      return;
    }
    this.handling = true;
    const fail = (reason: 'denied' | 'error', message: string) => {
      send(res, failedPage());
      this.end({ ok: false, reason, message });
    };
    const error = url.searchParams.get('error');
    if (error) {
      return fail(error === 'access_denied' ? 'denied' : 'error', url.searchParams.get('error_description') ?? error);
    }
    const code = url.searchParams.get('code');
    if (!code) return fail('error', 'The sign-in answer had no code.');
    try {
      const info = await this.options.exchange(code, this.verifier, this.redirectUri);
      // Cancelled or timed out during the exchange: the app dropped it.
      if (this.done) return send(res, failedPage());
      send(res, signedInPage(new URL(this.options.server).host, info));
      this.end({ ok: true, info });
    } catch (e) {
      fail('error', e instanceof Error ? e.message : String(e));
    }
  }
}

function send(res: ServerResponse, html: string, status = 200): void {
  res
    .writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    })
    .end(html);
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// The web client's look, inline: the Emerald tokens and the "P" logo.
function page(mark: string, markClass: string, title: string, lead: string, foot: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Promptbook</title>
<style>
:root { --bg: #131917; --surface: #1a221f; --border: #33403a; --text: #e7ece9; --muted: #97a49d; --faint: #6b7972;
  --primary: #1fb98a; --on-primary: #08150f; --danger: #ff5a6a; color-scheme: dark; }
@media (prefers-color-scheme: light) { :root { --bg: #eef1ef; --surface: #ffffff; --border: #d3dbd7; --text: #17201c;
  --muted: #5b6862; --faint: #8b9690; --primary: #0f8f69; --on-primary: #ffffff; --danger: #d42a3c; color-scheme: light; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text);
  font: 15px/1.5 'Barlow', system-ui, sans-serif; }
.card { width: min(420px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 32px; text-align: center; }
.brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px;
  font: 700 20px 'Barlow Condensed', 'Barlow', sans-serif; letter-spacing: .02em; }
.logo { width: 30px; height: 30px; border-radius: 6px; background: var(--primary); color: var(--on-primary);
  display: grid; place-items: center; font: 700 18px 'Barlow Condensed', 'Barlow', sans-serif; }
.mark { width: 48px; height: 48px; margin: 0 auto 16px; border-radius: 50%; display: grid; place-items: center;
  font-size: 26px; font-weight: 700; }
.mark.ok { color: var(--primary); border: 2px solid var(--primary); }
.mark.err { color: var(--danger); border: 2px solid var(--danger); }
h1 { font: 600 24px 'Barlow Condensed', 'Barlow', sans-serif; margin: 0 0 8px; }
p { margin: 0; color: var(--muted); }
.foot { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--faint); font-size: 13px; }
</style>
</head>
<body>
<main class="card">
<div class="brand"><div class="logo">P</div>Promptbook</div>
<div class="mark ${markClass}">${mark}</div>
<h1>${escape(title)}</h1>
<p>${escape(lead)}</p>
${foot ? `<div class="foot">${escape(foot)}</div>` : ''}
</main>
</body>
</html>`;
}

export function signedInPage(host: string, info: SignedIn): string {
  const kind = info.signIn === 'oidc' ? 'single sign-on' : 'local account';
  return page(
    '✓',
    'ok',
    'Signed in',
    'Signed in to Promptbook on this computer. You can close this tab.',
    `${host} · ${info.displayName} · ${kind}`,
  );
}

export const failedPage = () => page('!', 'err', 'Sign-in did not finish', 'Go back to Promptbook and try again.', '');
