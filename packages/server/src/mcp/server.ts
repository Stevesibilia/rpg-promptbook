import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db.js';
import type { OAuthScope } from '../oauth/config.js';
import type { Sync } from '../sync.js';
import { INSTRUCTIONS, registerTools } from './tools.js';

// The MCP server, built fresh for every request (connector design decision
// 10, as gdrarchive's mcp/server.ts). Stateless: no session id, nothing to
// evict, and every tool is one request and one answer. A fresh instance is
// also what keeps the caller safe: the tools close over the one caller the
// route verified on this request.

// What the route verified, carried to the tools as AuthInfo.extra.
export interface McpCaller {
  userId: string;
  scope: OAuthScope;
  grantId: string;
  clientName: string;
}

// The caller off the verified token. The SDK passes authInfo through as the
// route set it and verifies nothing itself, so this is the route's value,
// not a claim of the request.
export function callerFrom(authInfo: AuthInfo | undefined): McpCaller {
  const extra = authInfo?.extra as McpCaller | undefined;
  // Unreachable through the route, which answers 401 first; a failure rather
  // than a default caller nobody authorized.
  if (!extra?.userId) throw new Error('MCP request reached the tools with no verified caller');
  return extra;
}

export interface McpDeps {
  db: Db;
  sync: Sync;
  log: FastifyBaseLogger;
  version: string;
}

// JSON responses: every exchange is one request and one result, so no SSE.
export function buildMcpHandler(deps: McpDeps) {
  const handler = createMcpHandler(
    (ctx) => {
      const server = new McpServer(
        { name: 'promptbook', version: deps.version },
        { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
      );
      registerTools(server, callerFrom(ctx.authInfo), deps);
      return server;
    },
    {
      responseMode: 'json',
      onerror: (err) => deps.log.error({ err }, 'MCP handler error'),
    },
  );
  return toNodeHandler(handler, { onerror: (err) => deps.log.error({ err }, 'MCP adapter error') });
}
