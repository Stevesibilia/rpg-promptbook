import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../accounts/auth.js';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import {
  isLoopbackOnlyClient,
  RegistrationError,
  registerClient,
  resolveClient,
  validateRedirectUri,
  type OAuthClient,
} from '../oauth/clients.js';
import {
  MCP_PATH,
  OAUTH_SCOPES,
  oauthConfig,
  parseScopeParameter,
  scopeWithin,
  type OAuthConfig,
  type OAuthScope,
} from '../oauth/config.js';
import { createGrant, listGrants, revokeGrant } from '../oauth/grants.js';
import {
  issueCode,
  issueTokens,
  redeemCode,
  revokeByTokenValue,
  rotateRefreshToken,
  sweepExpired,
  TokenError,
} from '../oauth/tokens.js';

// The authorization server for the MCP endpoint and nothing else (connector
// design decisions 7 to 9, ported from gdrarchive). Three kinds of route,
// each with its own relation to the session cookie:
// - the well-known metadata, public, outside /api;
// - registration, token and revocation, called by programs from anywhere,
//   which never read the cookie (OAUTH_ROUTES in accounts/auth.ts);
// - the consent and Connected apps routes, ordinary session routes called by
//   the app's own pages, under the same-origin rule.

// A token or registration request is a handful of short parameters.
const SMALL_BODY_LIMIT = 8 * 1024;

// RFC 6749 section 5.2's error shape, and no-store on every answer of these
// endpoints so no proxy keeps a token response.
function sendOAuthError(reply: FastifyReply, status: number, error: string, description: string): FastifyReply {
  return reply.code(status).header('cache-control', 'no-store').send({ error, error_description: description });
}

// A flat form body that refuses a repeated parameter (RFC 6749 section 3.2):
// accepting one silently lets the server and the client disagree on which
// value was meant. Registered in its own scope, so no other route starts
// taking form bodies.
function formBodyParser(_req: FastifyRequest, body: string, done: (err: Error | null, value?: unknown) => void): void {
  const fields: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    if (Object.hasOwn(fields, key)) {
      done(new AppError(400, 'invalid_request', `The parameter ${key} was sent more than once.`));
      return;
    }
    fields[key] = value;
  }
  done(null, fields);
}

const isForm = (req: FastifyRequest) =>
  (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase() === 'application/x-www-form-urlencoded';

function formField(body: unknown, name: string): string | undefined {
  const value = (body as Record<string, unknown> | null | undefined)?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// The authorization request, as /authorize receives it and the consent page
// sends it back.
const authorizeQuery = z.object({
  client_id: z.string().min(1, 'is required').max(2048),
  redirect_uri: z.string().min(1, 'is required').max(2048),
  response_type: z.string().min(1, 'is required').max(100),
  code_challenge: z.string().min(1, 'is required').max(256),
  code_challenge_method: z.string().min(1, 'is required').max(100),
  resource: z.string().min(1, 'is required').max(2048),
  scope: z.string().max(256).optional(),
  // Opaque here: handed back to the client exactly as it came.
  state: z.string().max(2048).optional(),
});
type AuthorizeQuery = z.output<typeof authorizeQuery>;

const approveBody = authorizeQuery.extend({ granted_scope: z.enum(OAUTH_SCOPES) });

const registrationBody = z.object({
  client_name: z.string().trim().min(1, 'is required').max(200),
  redirect_uris: z.array(z.string().min(1).max(2048)).min(1, 'needs at least one redirect URI').max(20),
  client_uri: z.string().max(2048).optional(),
  // Accepted and not kept: nothing shows a logo.
  logo_uri: z.string().max(2048).optional(),
  token_endpoint_auth_method: z.string().max(100).optional(),
  grant_types: z.array(z.string().max(100)).max(10).optional(),
  response_types: z.array(z.string().max(100)).max(10).optional(),
  scope: z.string().max(256).optional(),
});

interface ValidatedRequest {
  client: OAuthClient;
  query: AuthorizeQuery;
  requestedScopes: OAuthScope[];
}

// The consent page's view of a request.
export interface ConsentRequest {
  client_name: string;
  // The host of the client's own address, as text: the page never makes the
  // client's URL a link.
  client_host: string | null;
  redirect_host: string;
  loopback_only: boolean;
  requested_scopes: OAuthScope[];
}

export async function oauthRoutes(app: FastifyInstance, { config, db }: { config: Config; db: Db }) {
  const oauth: OAuthConfig = oauthConfig(config.publicOrigin);

  // Everything a request must satisfy before anyone is shown anything or any
  // redirect is built. A failure throws and the consent page shows it; nothing
  // is redirected on a failure, since an unknown client or an unregistered
  // redirect URI is exactly where an error must not be sent.
  async function validateRequest(raw: unknown): Promise<ValidatedRequest> {
    const parsed = authorizeQuery.safeParse(raw ?? {});
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
      throw new AppError(400, 'invalid_request', `The authorization request is missing or malformed: ${fields}.`);
    }
    const query = parsed.data;
    if (query.response_type !== 'code') {
      throw new AppError(
        400,
        'unsupported_response_type',
        'This server issues authorization codes only (response_type=code).',
      );
    }
    if (query.code_challenge_method !== 'S256') {
      throw new AppError(400, 'invalid_request', 'This server accepts the S256 PKCE method only.');
    }
    if (query.resource !== oauth.resource) {
      throw new AppError(
        400,
        'invalid_target',
        `This server issues tokens for ${oauth.resource} only, and the request named something else.`,
      );
    }
    const requestedScopes = parseScopeParameter(query.scope);
    if (!requestedScopes) {
      throw new AppError(400, 'invalid_scope', `The scopes this server supports are ${OAUTH_SCOPES.join(' and ')}.`);
    }
    const client = await resolveClient(db, query.client_id);
    if (!client) {
      throw new AppError(
        400,
        'invalid_client',
        'That client is not registered here and its client_id is not a metadata document URL.',
      );
    }
    if (!validateRedirectUri(client, query.redirect_uri)) {
      throw new AppError(
        400,
        'invalid_request',
        'That redirect URI is not one the client registered, so you will not be sent to it.',
      );
    }
    return { client, query, requestedScopes };
  }

  // Where the browser goes, built here from the validated redirect URI, never
  // by the page; iss on every answer (RFC 9207).
  function redirectTo(validated: ValidatedRequest, parameters: Record<string, string | undefined>) {
    const url = new URL(validated.query.redirect_uri);
    for (const [name, value] of Object.entries(parameters)) {
      if (value !== undefined) url.searchParams.set(name, value);
    }
    url.searchParams.set('iss', oauth.issuer);
    return { redirect_to: url.toString() };
  }

  // Metadata (RFC 9728 at both paths, RFC 8414).

  const protectedResource = async () => ({
    resource: oauth.resource,
    authorization_servers: [oauth.issuer],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ['header'],
  });
  app.get(`/.well-known/oauth-protected-resource${MCP_PATH}`, protectedResource);
  app.get('/.well-known/oauth-protected-resource', protectedResource);

  app.get('/.well-known/oauth-authorization-server', async () => ({
    issuer: oauth.issuer,
    authorization_endpoint: oauth.authorizationEndpoint,
    token_endpoint: oauth.tokenEndpoint,
    registration_endpoint: oauth.registrationEndpoint,
    revocation_endpoint: oauth.revocationEndpoint,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: OAUTH_SCOPES,
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }));

  // RFC 7591 dynamic registration, public clients only.
  app.post('/api/oauth/register', { bodyLimit: SMALL_BODY_LIMIT }, async (req, reply) => {
    const parsed = registrationBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
      return sendOAuthError(reply, 400, 'invalid_client_metadata', `The registration is missing or malformed: ${fields}.`);
    }
    const body = parsed.data;
    try {
      const client = await registerClient(
        db,
        {
          clientName: body.client_name,
          redirectUris: body.redirect_uris,
          clientUri: body.client_uri,
          tokenEndpointAuthMethod: body.token_endpoint_auth_method,
        },
        req.ip,
      );
      return reply
        .code(201)
        .header('cache-control', 'no-store')
        .send({
          client_id: client.clientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_name: client.clientName,
          redirect_uris: client.redirectUris,
          client_uri: client.clientUri ?? undefined,
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        });
    } catch (error) {
      if (error instanceof RegistrationError) return sendOAuthError(reply, 400, error.code, error.message);
      throw error;
    }
  });

  // Consent, for the /authorize page: session only, same origin.

  app.get('/api/oauth/authorize', async (req): Promise<ConsentRequest> => {
    requireSession(req);
    const validated = await validateRequest(req.query);
    return {
      client_name: validated.client.clientName,
      client_host: validated.client.clientUri ? new URL(validated.client.clientUri).host : null,
      redirect_host: new URL(validated.query.redirect_uri).host,
      loopback_only: isLoopbackOnlyClient(validated.client),
      requested_scopes: validated.requestedScopes,
    };
  });

  // Allow: the grant, a code, and where to send the browser. Every check runs
  // again rather than trusting what the page was shown.
  app.post('/api/oauth/authorize', async (req) => {
    const { user } = requireSession(req);
    const parsed = approveBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, 'invalid_request', 'The approval is missing or malformed.');
    const body = parsed.data;
    const validated = await validateRequest(body);
    if (!scopeWithin(body.granted_scope, validated.requestedScopes)) {
      throw new AppError(
        400,
        'invalid_scope',
        `The client asked for ${validated.requestedScopes.join(' ')}, and ${body.granted_scope} is wider than that.`,
      );
    }
    const code = await db.withTransaction(async (tx) => {
      const grantId = await createGrant(tx, user.id, validated.client.id, body.granted_scope);
      return issueCode(tx, grantId, {
        redirectUri: validated.query.redirect_uri,
        codeChallenge: validated.query.code_challenge,
        resource: validated.query.resource,
      });
    });
    return redirectTo(validated, { code, state: validated.query.state });
  });

  // Deny: nothing recorded, the client told at its redirect URI, which had
  // to be valid like an approval's.
  app.post('/api/oauth/authorize/deny', async (req) => {
    requireSession(req);
    const validated = await validateRequest(req.body);
    return redirectTo(validated, { error: 'access_denied', state: validated.query.state });
  });

  // Token and revocation, form-encoded only, in a scope of their own.
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: SMALL_BODY_LIMIT },
      formBodyParser,
    );
    // A body refused before the handler (a repeated parameter, too large, a
    // type with no parser) still answers in RFC 6749's shape.
    scope.setErrorHandler((error, _req, reply) => {
      if (error instanceof AppError) return sendOAuthError(reply, error.status, error.code, error.message);
      const status = (error as { statusCode?: number }).statusCode;
      if (status && status >= 400 && status < 500) {
        return sendOAuthError(reply, status, 'invalid_request', (error as Error).message);
      }
      throw error;
    });

    scope.post('/api/oauth/token', { bodyLimit: SMALL_BODY_LIMIT }, async (req, reply) => {
      if (!isForm(req)) {
        return sendOAuthError(reply, 400, 'invalid_request', 'The token request must be form-encoded.');
      }
      await sweepExpired(db);
      const grantType = formField(req.body, 'grant_type');
      try {
        if (grantType === 'authorization_code') {
          const code = formField(req.body, 'code');
          const redirectUri = formField(req.body, 'redirect_uri');
          const clientId = formField(req.body, 'client_id');
          const codeVerifier = formField(req.body, 'code_verifier');
          if (!code || !redirectUri || !clientId || !codeVerifier) {
            throw new TokenError('invalid_request', 'code, redirect_uri, client_id and code_verifier are all required.');
          }
          const { grantId, scope: granted } = await redeemCode(db, {
            code,
            clientId,
            redirectUri,
            codeVerifier,
            // One resource here: a client that names none means it.
            resource: formField(req.body, 'resource') ?? oauth.resource,
          });
          const issued = await issueTokens(db, grantId, oauth.resource);
          return reply.header('cache-control', 'no-store').send({
            access_token: issued.accessToken,
            token_type: 'Bearer',
            expires_in: issued.expiresIn,
            refresh_token: issued.refreshToken,
            scope: granted,
          });
        }
        if (grantType === 'refresh_token') {
          const presented = formField(req.body, 'refresh_token');
          const clientId = formField(req.body, 'client_id');
          if (!presented || !clientId) {
            throw new TokenError('invalid_request', 'refresh_token and client_id are both required.');
          }
          const rotated = await rotateRefreshToken(db, {
            refreshToken: presented,
            clientId,
            resource: formField(req.body, 'resource'),
          });
          const issued = await issueTokens(db, rotated.grantId, rotated.resource);
          return reply.header('cache-control', 'no-store').send({
            access_token: issued.accessToken,
            token_type: 'Bearer',
            expires_in: issued.expiresIn,
            refresh_token: issued.refreshToken,
            scope: rotated.scope,
          });
        }
        throw new TokenError('unsupported_grant_type', 'This server supports authorization_code and refresh_token.');
      } catch (error) {
        if (error instanceof TokenError) {
          // The grant type and the code, nothing else of this body.
          req.log.warn({ grant_type: grantType, code: error.code }, 'OAuth token request refused');
          return sendOAuthError(reply, 400, error.code, error.message);
        }
        throw error;
      }
    });

    // RFC 7009: 200 whether or not the value was known.
    scope.post('/api/oauth/revoke', { bodyLimit: SMALL_BODY_LIMIT }, async (req, reply) => {
      if (!isForm(req)) {
        return sendOAuthError(reply, 400, 'invalid_request', 'The revocation request must be form-encoded.');
      }
      const presented = formField(req.body, 'token');
      if (presented) await revokeByTokenValue(db, presented);
      return reply.code(200).header('cache-control', 'no-store').send({});
    });
  });

  // Connected apps.

  app.get('/api/auth/grants', async (req) => {
    const { user } = requireSession(req);
    return { grants: await listGrants(db, user.id) };
  });

  app.delete('/api/auth/grants/:id', async (req, reply) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    await revokeGrant(db, user.id, id);
    return reply.code(204).send();
  });
}
