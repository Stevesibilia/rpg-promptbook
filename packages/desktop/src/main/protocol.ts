import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// promptbook://app/, the window's origin (desktop-app design decision 2): the
// web client's build from app/web, and the board's files (fileRoute). A path naming a file there answers it; any
// other path answers index.html, the single-page app's fallback; a path that
// leaves the folder, or another host, answers 404. Every answer carries the
// server's content security policy with connect-src 'self' only.

export const SCHEME = 'promptbook';
export const APP_ORIGIN = 'promptbook://app';
export const APP_URL = `${APP_ORIGIN}/`;

export const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "script-src-attr 'none'",
  "style-src 'self' https: 'unsafe-inline'",
  "connect-src 'self'",
].join('; ');

export const privileges = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  corsEnabled: true,
  stream: true,
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export const contentType = (path: string) => TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';

// The file a request names under `root`, 'index' for the fallback, or null
// for a 404.
export function resolveAppPath(root: string, requestUrl: string): string | 'index' | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:` || url.host !== 'app') return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (path.includes('\0') || path.includes('\\')) return null;
  if (path === '/' || path === '') return 'index';
  const base = resolve(root);
  const file = resolve(base, `.${path}`);
  if (!file.startsWith(base + sep)) return null;
  return file;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILE_PATH = new RegExp(`^/api/projects/(${UUID})/files/([0-9a-f]{64})$`);

// The board's file route (asset-board design decision 14), answered by main
// before the app's files: the project and the file a request names, 'invalid'
// for any other path under /api/ (never the single-page app's fallback), or
// null for the app. Only these two values reach the files store: no part of
// the path names anything on disk.
export function fileRoute(requestUrl: string): { projectId: string; sha256: string } | 'invalid' | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:` || url.host !== 'app' || !url.pathname.startsWith('/api/')) return null;
  const m = FILE_PATH.exec(url.pathname);
  return m ? { projectId: m[1]!, sha256: m[2]! } : 'invalid';
}

const headers = (type: string) => ({
  'content-type': type,
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-cache',
});

// The protocol's answer to one request.
export async function serveApp(root: string, request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const target = resolveAppPath(root, request.url);
  if (target === null) return new Response('Not found', { status: 404, headers: headers('text/plain; charset=utf-8') });
  let file = target === 'index' ? resolve(root, 'index.html') : target;
  try {
    if (!(await stat(file)).isFile()) file = resolve(root, 'index.html');
  } catch {
    file = resolve(root, 'index.html');
  }
  try {
    const body = await readFile(file);
    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers: headers(contentType(file)) });
  } catch {
    return new Response('Not found', { status: 404, headers: headers('text/plain; charset=utf-8') });
  }
}
