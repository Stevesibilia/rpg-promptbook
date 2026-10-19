import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { resolveSession, type Session } from './sessions.js';

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
export const PUBLIC_ROUTES = new Set(['POST /api/auth/login', 'GET /api/auth/me', 'GET /api/health']);

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const isApiUrl = (url: string) => url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');

const isPublic = (req: FastifyRequest) => PUBLIC_ROUTES.has(`${req.method} ${req.routeOptions.url ?? ''}`);

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

async function plugin(app: FastifyInstance, { config, db }: { config: Config; db: Db }) {
  await app.register(cookie);

  // onRequest rather than preHandler, so the origin rule covers sign-in too:
  // a cross-site post that signs the victim into another account is a real
  // attack, and it happens before there is any session.
  app.addHook('onRequest', async (req, reply) => {
    assertSameOrigin(req, config.publicOrigin);

    const token = req.cookies[SESSION_COOKIE];
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
