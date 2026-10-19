import type { FastifyInstance } from 'fastify';

// Speaking MCP to /api/mcp as a client does, as gdrarchive's tests do. The
// 2026-07-28 revision repeats the method (and a tool's name) in headers and
// carries a _meta envelope; the server refuses a request whose headers and
// body disagree. The 2025-era shape is a plain body with no protocol header,
// served by the SDK's stateless legacy fallback, which answers in SSE frames
// even in JSON mode. Both are what clients in use send.

export const MODERN_PROTOCOL_VERSION = '2026-07-28';
export const LEGACY_PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'promptbook-tests', version: '1.0.0' };

export interface McpAnswer {
  status: number;
  headers: Record<string, unknown>;
  message: {
    result?: Record<string, unknown>;
    error?: { code: number; message: string; data?: unknown };
  };
}

function parseAnswer(status: number, headers: Record<string, unknown>, body: string): McpAnswer {
  const framed = /^data: (.*)$/m.exec(body);
  const json = framed ? framed[1]! : body;
  return { status, headers, message: json === '' ? {} : JSON.parse(json) };
}

export interface CallOptions {
  token?: string;
  era?: 'modern' | 'legacy';
  headers?: Record<string, string>;
  body?: unknown;
}

export async function mcpCall(
  app: FastifyInstance,
  method: string,
  params: Record<string, unknown>,
  options: CallOptions = {},
): Promise<McpAnswer> {
  const era = options.era ?? 'modern';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    host: 'localhost:8090',
    ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
    ...(era === 'modern'
      ? {
          'mcp-protocol-version': MODERN_PROTOCOL_VERSION,
          'mcp-method': method,
          ...(typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
        }
      : {}),
    ...options.headers,
  };
  const envelope =
    era === 'modern'
      ? {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': MODERN_PROTOCOL_VERSION,
            'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        }
      : {};
  const payload = options.body !== undefined ? options.body : { jsonrpc: '2.0', id: 1, method, params: { ...params, ...envelope } };
  const res = await app.inject({ method: 'POST', url: '/api/mcp', headers, payload: payload as never });
  return parseAnswer(res.statusCode, res.headers as Record<string, unknown>, res.payload);
}

export const mcpInitialize = (app: FastifyInstance, token: string) =>
  mcpCall(
    app,
    'initialize',
    { protocolVersion: LEGACY_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    { token, era: 'legacy' },
  );

export interface ListedTool {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] };
  annotations?: Record<string, unknown>;
}

export async function mcpListTools(app: FastifyInstance, token: string, era: 'modern' | 'legacy' = 'modern') {
  const answer = await mcpCall(app, 'tools/list', {}, { token, era });
  if (answer.message.error) throw new Error(`tools/list failed: ${JSON.stringify(answer.message.error)}`);
  return (answer.message.result?.tools ?? []) as ListedTool[];
}

export interface ToolOutcome {
  isError: boolean;
  error?: { code: string; message: string; field?: string; scope_required?: string; details?: any } | undefined;
  value?: any;
  text: string;
  rpcError?: { code: number; message: string };
}

export async function mcpCallTool(
  app: FastifyInstance,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
  era: 'modern' | 'legacy' = 'modern',
): Promise<ToolOutcome> {
  const answer = await mcpCall(app, 'tools/call', { name, arguments: args }, { token, era });
  if (answer.message.error) return { isError: true, text: '', rpcError: answer.message.error };
  const result = (answer.message.result ?? {}) as {
    isError?: boolean;
    content?: { type: string; text?: string }[];
    structuredContent?: { error?: ToolOutcome['error'] };
  };
  const text = (result.content ?? []).map((part) => part.text ?? '').join('');
  if (result.isError) return { isError: true, error: result.structuredContent?.error, text };
  return { isError: false, value: text === '' ? undefined : JSON.parse(text), text };
}
