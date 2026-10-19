import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DiscoveryRequestOptions } from 'openid-client';
import { setSessionCookie } from '../accounts/auth.js';
import { createOidcProvider, HANDSHAKE_TTL_SECONDS, safeReturnTo, SignInError } from '../accounts/oidc.js';
import { createSession } from '../accounts/sessions.js';
import type { Config, OidcConfig } from '../config.js';
import type { Db } from '../db.js';

// The browser half of a handshake: a random secret whose SHA-256 the
// handshake row keeps. SameSite=Lax, because the provider sends the browser
// back by a cross-site top-level GET, which Strict would leave without it.
// Cleared at the callback whatever the outcome. Over https it is a __Host-
// cookie (Secure, Path=/, no Domain), which a sibling subdomain cannot plant;
// over plain http, in development, it is scoped to these routes instead.
export function handshakeCookie(req: FastifyRequest) {
  return req.protocol === 'https'
    ? { name: '__Host-pb_oidc', path: '/', secure: true }
    : { name: 'pb_oidc', path: '/api/auth/oidc', secure: false };
}

export async function oidcRoutes(
  app: FastifyInstance,
  {
    config,
    db,
    oidc,
    discoveryOptions,
  }: { config: Config; db: Db; oidc: OidcConfig; discoveryOptions?: DiscoveryRequestOptions | undefined },
) {
  const provider = createOidcProvider(db, oidc, discoveryOptions);

  app.get('/api/auth/oidc/start', async (req, reply) => {
    try {
      const { url, browserSecret } = await provider.start(safeReturnTo((req.query as { return_to?: unknown }).return_to));
      const { name, path, secure } = handshakeCookie(req);
      reply.setCookie(name, browserSecret, { httpOnly: true, sameSite: 'lax', secure, path, maxAge: HANDSHAKE_TTL_SECONDS });
      return reply.redirect(url.href, 302);
    } catch (error) {
      return failed(req, reply, error);
    }
  });

  // Fastify's request lines are info and carry the URL, whose query holds
  // the provider's one-time code: this route logs warnings only.
  app.get('/api/auth/oidc/callback', { logLevel: 'warn' }, async (req, reply) => {
    const { name, path, secure } = handshakeCookie(req);
    const browserSecret = req.cookies[name];
    reply.clearCookie(name, { path, secure, httpOnly: true, sameSite: 'lax' });
    try {
      const query = new URL(req.url, 'http://callback').search;
      const { user, returnTo } = await provider.finish(query, browserSecret);
      const { token } = await createSession(db, user.id, config.sessionTtlHours);
      await db.query('update users set last_login_at = now() where id = $1', [user.id]);
      setSessionCookie(reply, req, token, config.sessionTtlHours);
      return reply.redirect(safeReturnTo(returnTo), 302);
    } catch (error) {
      return failed(req, reply, error);
    }
  });
}

// The browser is mid-redirect: it goes to the sign-in page with a reason it
// can show, not to a JSON body. The log names the failure and never carries
// the code, a token or the provider's answer.
function failed(req: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (!(error instanceof SignInError)) {
    req.log.error({ err: error }, 'Single sign-on failed');
    return reply.redirect('/?sign_in=failed', 302);
  }
  if (!error.log) return reply.redirect(`/?sign_in=${error.reason}`, 302);
  const cause = error.cause instanceof Error ? error.cause : null;
  req.log.warn(
    {
      reason: error.reason,
      ...(cause && { cause: { name: cause.name, code: (cause as { code?: unknown }).code, message: cause.message } }),
    },
    `Single sign-on failed: ${error.message}`,
  );
  return reply.redirect(`/?sign_in=${error.reason}`, 302);
}
