import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { APP_SCOPE, oauthConfig } from '../oauth/config.js';
import { verifyAccessToken } from '../oauth/tokens.js';
import { resolveSession, type CookieSession, type Session } from './sessions.js';
import { findUserById } from './users.js';

declare module 'fastify' {
  interface FastifyRequest {
    // Set by the auth hook on every request that carries a live session.
    session?: Session;
  }
}

export const SESSION_COOKIE = 'pb_session';

// API routes reachable without a session, as `METHOD path`. An allowlist
// rather than a marker on protected routes: a route added later and
// forgotten is protected, which is the direction the mistake should fall in.
export const PUBLIC_ROUTES = new Set([
  'POST /api/auth/login',
  'GET /api/auth/me',
  'GET /api/auth/config',
  'GET /api/auth/oidc/start',
  'GET /api/auth/oidc/callback',
  'GET /api/health',
]);

// The connector's OAuth routes (connector design decision 9): called by
// programs from any origin, with a bearer token or no credential at all.
// They skip the same-origin check and never read the cookie, so a page in a
// signed-in browser cannot make them act. The MCP methods that are not POST
// answer 405 to anyone: which methods an endpoint has is not a secret, and a
// 401 would send a client to authorize again for nothing.
export const OAUTH_ROUTES = new Set([
  'POST /api/oauth/register',
  'POST /api/oauth/token',
  'POST /api/oauth/revoke',
  'POST /api/mcp',
  'GET /api/mcp',
  'HEAD /api/mcp',
  'DELETE /api/mcp',
]);

// Session routes that act for the browser itself, so the desktop app's token
// cannot use them (desktop-app design decision 8): consent, which would let
// the app approve clients without a click, and sign-out, which the app does
// by revoking its grant.
export const COOKIE_SESSION_ROUTES = new Set([
  'GET /api/oauth/authorize',
  'POST /api/oauth/authorize',
  'POST /api/oauth/authorize/deny',
  'POST /api/auth/logout',
]);

// The paths any origin may call without credentials, as concrete paths: a
// preflight arrives on the wildcard OPTIONS route, whose pattern is *.
// Discovery, registration, tokens, revocation and the MCP endpoint, none of
// which reads the cookie.
export function isPermissiveCorsPath(path: string): boolean {
  if (path.startsWith('/.well-known/oauth-')) return true;
  return ['/api/mcp', '/api/oauth/token', '/api/oauth/register', '/api/oauth/revoke'].includes(path);
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const isApiUrl = (url: string) => url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');

const routeKey = (req: FastifyRequest) => `${req.method} ${req.routeOptions.url ?? ''}`;
const isPublic = (req: FastifyRequest) => PUBLIC_ROUTES.has(routeKey(req));
export const isOAuthRoute = (req: FastifyRequest) => OAUTH_ROUTES.has(routeKey(req));

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Refuses a write whose Origin, or without one whose Referer, is not the
// public URL's origin. A write with neither header passes: browsers send
// Origin on every cross-site write, so it is not the attack this check is
// for, and refusing it would only break curl and the command line.
export function assertSameOrigin(req: FastifyRequest, publicOrigin: string): void {
  if (!UNSAFE_METHODS.has(req.method)) return;
  const stated = req.headers.origin ?? req.headers.referer;
  if (typeof stated !== 'string' || stated === '') return;
  if (originOf(stated) !== publicOrigin) {
    throw new AppError(403, 'cross_origin', 'Cross-origin request refused.');
  }
}

export function setSessionCookie(reply: FastifyReply, req: FastifyRequest, token: string, ttlHours: number): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // req.protocol reads X-Forwarded-Proto only from a trusted proxy.
    secure: req.protocol === 'https',
    path: '/',
    maxAge: Math.floor(ttlHours * 3600),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function requireSession(req: FastifyRequest): Session {
  if (!req.session) throw new AppError(401, 'unauthenticated', 'Sign in first.');
  return req.session;
}

const cookieSessionRequired = () =>
  new AppError(403, 'cookie_session_required', 'This needs a session in the browser, not the desktop app’s token.');

// For the routes of COOKIE_SESSION_ROUTES, which the hook already refuses to
// an app session.
export function requireCookieSession(req: FastifyRequest): CookieSession {
  const session = requireSession(req);
  if (session.via !== 'cookie' || session.tokenHash === null) throw cookieSessionRequired();
  return session as CookieSession;
}

// The value of an Authorization: Bearer header, or null.
export function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  return /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] ?? null;
}

// The desktop app's session: a live access token issued for the app
// resource, under a grant with the app scope, and its grant's user. Null for
// every other token alike, an MCP one included, so it answers as no
// credential.
async function resolveAppSession(db: Db, value: string, appResource: string): Promise<Session | null> {
  const caller = await verifyAccessToken(db, value, appResource);
  if (!caller || caller.scope !== APP_SCOPE) return null;
  const user = await findUserById(db, caller.userId);
  return user ? { tokenHash: null, user, via: 'app', grantId: caller.grantId } : null;
}

async function plugin(app: FastifyInstance, { config, db }: { config: Config; db: Db }) {
  await app.register(cookie);
  const { appResource } = oauthConfig(config.publicOrigin);

  // onRequest rather than preHandler, so the origin rule covers sign-in too:
  // a cross-site post that signs the victim into another account is a real
  // attack, and it happens before there is any session.
  app.addHook('onRequest', async (req, reply) => {
    if (isOAuthRoute(req)) return;
    const token = req.cookies[SESSION_COOKIE];

    // The desktop app: an API request with no cookie and the app's bearer
    // token. A page cannot make a browser send that header cross-site, so
    // such a request skips the origin rule, and only that.
    const bearer = !token && isApiUrl(req.url) ? bearerToken(req) : null;
    if (bearer) {
      const session = await resolveAppSession(db, bearer, appResource);
      if (session) req.session = session;
    }
    if (req.session?.via !== 'app') assertSameOrigin(req, config.publicOrigin);
    if (req.session?.via === 'app' && COOKIE_SESSION_ROUTES.has(routeKey(req))) throw cookieSessionRequired();

    if (token) {
      const session = await resolveSession(db, token);
      if (session) req.session = session;
      // A cookie for a session that is gone: drop it so the browser stops
      // sending it.
      else clearSessionCookie(reply);
    }

    // Everything outside /api is the web app and its files, and /sync checks
    // its own connections.
    if (!isApiUrl(req.url) || isPublic(req)) return;
    requireSession(req);
  });
}

export const authPlugin = fp(plugin, { name: 'auth' });
