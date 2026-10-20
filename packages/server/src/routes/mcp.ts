import { validateHostHeader } from '@modelcontextprotocol/server';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { bearerToken } from '../accounts/auth.js';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { WriteQuota } from '../mcp/quota.js';
import { buildMcpHandler, type McpCaller } from '../mcp/server.js';
import { MCP_PATH, oauthConfig } from '../oauth/config.js';
import { verifyAccessToken } from '../oauth/tokens.js';
import type { Sync } from '../sync.js';

// The MCP endpoint (connector design decision 10, as gdrarchive's
// routes/mcp.ts): one route, one credential, no session. It reads the
// Authorization header and nothing else; the auth hook never reads the
// cookie here (OAUTH_ROUTES), so a page in a signed-in browser cannot make
// it act.

const MCP_BODY_LIMIT = 1024 * 1024;

// The 401 that tells a client where to start. invalid_token only when a
// token was sent (RFC 6750): refresh, or start over. Why a token failed is
// never said, so the answer tells nothing about which tokens exist.
function challenge(reply: FastifyReply, resourceMetadataUrl: string, presented: boolean): FastifyReply {
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl}"`];
  if (presented) parts.push('error="invalid_token"');
  return reply
    .code(401)
    .header('www-authenticate', parts.join(', '))
    .send({
      error: 'unauthenticated',
      message: presented
        ? 'That access token is not valid for this endpoint.'
        : 'This endpoint needs an OAuth access token issued by this Promptbook.',
    });
}

export async function mcpRoutes(app: FastifyInstance, { config, db, sync }: { config: Config; db: Db; sync: Sync }) {
  const oauth = oauthConfig(config.publicOrigin);
  const allowedHost = new URL(config.publicOrigin).hostname;
  const node = buildMcpHandler({ db, sync, log: app.log, version: config.appVersion, quota: new WriteQuota() });

  // Stateless: no stream to open, no session to end. 405 to anyone, so a
  // client that opens with GET learns that instead of authorizing again.
  app.route({
    method: ['GET', 'HEAD', 'DELETE'],
    url: MCP_PATH,
    handler: async (_req, reply) =>
      reply
        .code(405)
        .header('allow', 'POST')
        .send({ error: 'method_not_allowed', message: 'This MCP endpoint is stateless and serves POST only.' }),
  });

  app.post(MCP_PATH, { bodyLimit: MCP_BODY_LIMIT }, async (req, reply) => {
    // The SDK's DNS rebinding guard, against PUBLIC_URL's host name.
    if (!validateHostHeader(req.headers.host, [allowedHost]).ok) {
      return reply
        .code(421)
        .send({ error: 'host_not_allowed', message: `This endpoint answers for ${allowedHost} only.` });
    }
    const presented = bearerToken(req);
    if (!presented) return challenge(reply, oauth.resourceMetadataUrl, false);
    const caller = await verifyAccessToken(db, presented, oauth.resource);
    // An app token is bound to the app resource and fails above; its scope
    // is refused here too, so no app grant ever reaches a tool.
    if (!caller || caller.scope === 'app') return challenge(reply, oauth.resourceMetadataUrl, true);

    const extra: McpCaller = {
      userId: caller.userId,
      scope: caller.scope,
      grantId: caller.grantId,
      clientName: caller.clientName,
    };
    // The adapter reads auth off the raw request and hands it to the tools.
    (req.raw as typeof req.raw & { auth?: unknown }).auth = {
      token: presented,
      clientId: caller.grantId,
      scopes: [caller.scope],
      expiresAt: Math.floor(caller.expiresAt.getTime() / 1000),
      resource: new URL(oauth.resource),
      extra,
    };

    // Fastify has read the body already, so it is passed to the adapter, which
    // would otherwise wait on a consumed stream; and the reply is hijacked
    // before the adapter writes, so Fastify does not answer on top of it.
    reply.hijack();
    try {
      await node(req.raw as never, reply.raw as never, req.body);
    } catch (err) {
      // Past the hijack the error handler never runs: answer here, or the
      // socket stays open until the client gives up.
      app.log.error({ err }, 'MCP request failed after the reply was hijacked');
      if (!reply.raw.headersSent) reply.raw.writeHead(500, { 'content-type': 'application/json' });
      if (!reply.raw.writableEnded) {
        reply.raw.end(JSON.stringify({ error: 'internal', message: 'Something went wrong on the server.' }));
      }
    }
  });
}
