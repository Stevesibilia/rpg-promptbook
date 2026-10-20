import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { desktop, launch, tempUserData } from './launch.js';

// The window loads the web build from promptbook://app with no protocol or
// content security policy error; module workers and WebAssembly work from
// the protocol, and the page can reach nothing else (desktop-app design
// decisions 2 and 3).

const assets = readdirSync(join(desktop, 'app/web/assets'));
const asset = (prefix: string, ext: string) => {
  const name = assets.find((a) => a.startsWith(prefix) && a.endsWith(ext));
  if (!name) throw new Error(`No ${prefix}*${ext} in app/web/assets`);
  return `/assets/${name}`;
};
const fixture = readFileSync(join(desktop, '../format/fixtures/esempio.md'), 'utf8');

test('the window serves the web build, its workers and WebAssembly from the protocol', async () => {
  const userData = tempUserData();
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    const problems: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy|ERR_|net::|Failed to load|protocol/i.test(m.text())) problems.push(m.text());
    });
    // Until the web client's platform seam (brief C), its first REST call
    // reaches the protocol, which answers index.html: the bundle runs and
    // throws on that answer. Any other page error is a problem.
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.waitForLoadState('load');
    expect(page.url()).toBe('promptbook://app/');
    // The bundle's stylesheet applied (the Emerald background) and its
    // module ran (the page error below comes from its code).
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(19, 25, 23)');
    await expect.poll(() => pageErrors.length).toBeGreaterThan(0);
    expect(pageErrors.every((e) => e.includes("reading 'signIn'"))).toBe(true);

    // A layout asset, fetched as the PDF worker fetches it.
    const typ = await page.evaluate(async (url) => {
      const r = await fetch(url);
      return { status: r.status, type: r.headers.get('content-type'), csp: r.headers.get('content-security-policy') };
    }, asset('avventura-', '.typ'));
    expect(typ.status).toBe(200);
    expect(typ.csp).toContain("connect-src 'self'");

    // The PDF worker: a module worker that fetches and compiles typst.ts's
    // WebAssembly, then answers a PDF.
    const pdf = await page.evaluate(
      ({ url, text }) =>
        new Promise<{ kind: string; size: number; head: string; error?: string }>((resolve) => {
          const worker = new Worker(url, { type: 'module' });
          worker.onerror = (e) => resolve({ kind: 'error', size: 0, head: '', error: e.message });
          worker.onmessage = (e: MessageEvent) => {
            const d = e.data as { kind: string; bytes?: Uint8Array; error?: string };
            const bytes = d.bytes ?? new Uint8Array();
            resolve({
              kind: d.kind,
              size: bytes.byteLength,
              head: String.fromCharCode(...bytes.slice(0, 5)),
              ...(d.error ? { error: d.error } : {}),
            });
            worker.terminate();
          };
          worker.postMessage({
            kind: 'pdf',
            version: 1,
            text,
            options: { paper: 'a4', inkSaver: false, pregenerated: true, template: 'avventura@1' },
            project: { title: 'Esempio' },
          });
        }),
      { url: asset('pdf.worker-', '.js'), text: fixture },
    );
    expect(pdf, JSON.stringify(pdf)).toMatchObject({ kind: 'pdf', head: '%PDF-' });
    expect(pdf.size).toBeGreaterThan(10_000);

    // No protocol or policy error so far; the next ones are made on purpose.
    expect(problems).toEqual([]);

    // Nothing but the app's own origin: the server, or any other site.
    const blocked = await page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        violations.push(`${e.effectiveDirective} ${e.blockedURI}`),
      );
      let fetched = 'fetch allowed';
      try {
        await fetch('http://localhost:8091/api/health');
      } catch {
        fetched = 'fetch refused';
      }
      const socket = await new Promise<string>((resolve) => {
        try {
          const ws = new WebSocket('ws://localhost:8091/sync');
          ws.onopen = () => resolve('socket open');
          ws.onerror = () => resolve('socket refused');
        } catch {
          resolve('socket refused');
        }
      });
      await new Promise((r) => setTimeout(r, 200));
      return { fetched, socket, violations: violations.sort() };
    });
    expect(blocked).toEqual({
      fetched: 'fetch refused',
      socket: 'socket refused',
      violations: ['connect-src http://localhost:8091/api/health', 'connect-src ws://localhost:8091/sync'],
    });

    // The bridge is there, and holds no token.
    const bridge = await page.evaluate(() => {
      const b = (window as unknown as { promptbook?: Record<string, unknown> }).promptbook;
      return { keys: b ? Object.keys(b).sort() : [], text: JSON.stringify(b ?? null), require: typeof (window as { require?: unknown }).require };
    });
    expect(bridge.keys).toEqual(['auth', 'device', 'files', 'info', 'request', 'sync', 'updates']);
    expect(bridge.text).not.toMatch(/pb_at_|pb_rt_|token/i);
    expect(bridge.require).toBe('undefined');

    // Navigation away from the app is refused; the window stays on it.
    await page.evaluate(() => {
      location.href = 'https://example.com/';
    });
    await page.waitForTimeout(1_000);
    expect(page.url()).toMatch(/^promptbook:\/\/app\//);
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
