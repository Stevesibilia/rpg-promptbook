import { createHash, randomBytes } from 'node:crypto';
import { expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
import { baseURL } from './stack.js';

// Claude as an MCP client, for the specs that need its writes and not the
// connector's flow itself (connector.spec.ts tests that): registers, has the
// signed-in page allow it, and calls tools with the access token.

const RESOURCE = `${baseURL}/api/mcp`;
const REDIRECT = 'http://127.0.0.1:5998/callback';

export interface Claude {
  api: APIRequestContext;
  token: string;
  tool(name: string, args: Record<string, unknown>): Promise<Record<string, any>>;
}

let rpcId = 0;

// `page` is signed in; it is left on the client's redirect.
export async function connectClaude(page: Page): Promise<Claude> {
  const api = await playwrightRequest.newContext({ baseURL });
  const registered = await api.post('/api/oauth/register', {
    data: { client_name: `Claude ${Date.now().toString(36)}`, redirect_uris: [REDIRECT] },
  });
  expect(registered.status()).toBe(201);
  const clientId = ((await registered.json()) as { client_id: string }).client_id;
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: RESOURCE,
    scope: 'read read_write',
    state: 'board-e2e',
  });
  await page.route(`${new URL(REDIRECT).origin}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Back at the client.</p>' }),
  );
  await page.goto(`/authorize?${params}`);
  await page.getByRole('button', { name: 'Allow' }).click();
  await page.waitForURL((url) => url.href.startsWith(REDIRECT));
  const code = new URL(page.url()).searchParams.get('code')!;
  const exchanged = await api.post('/api/oauth/token', {
    form: { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier },
  });
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  const token = ((await exchanged.json()) as { access_token: string }).access_token;

  async function tool(name: string, args: Record<string, unknown>) {
    const response = await api.post('/api/mcp', {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': name,
      },
      data: {
        jsonrpc: '2.0',
        id: ++rpcId,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'promptbook-e2e', version: '1.0.0' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
    expect(response.status(), `${name} answered ${response.status()}`).toBe(200);
    const body = await response.text();
    const json = /^data: (.*)$/m.exec(body)?.[1] ?? body;
    const result = (JSON.parse(json) as { result: { isError?: boolean; content: { text: string }[] } }).result;
    expect(result.isError ?? false, `${name}: ${result.content?.[0]?.text}`).toBe(false);
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
  }

  return { api, token, tool };
}
