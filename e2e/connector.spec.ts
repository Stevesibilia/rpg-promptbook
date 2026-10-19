import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProject, signIn, syncPill, throttle } from './helpers.js';
import { baseURL, password, username } from './stack.js';

// The Claude connector against the compose stack (connector design decision
// 17), as gdrarchive's mcp-flow: a client finds the server from a 401,
// registers, sends the user to /authorize, trades the code for tokens and
// calls the MCP tools, whose writes reach the open views; then the views of
// History, Inspiration and Research by hand.

const sabaoth = await readFile(
  new URL('../packages/format/fixtures/l-ancora-di-sabaoth.converted.md', import.meta.url),
  'utf8',
);

const RESOURCE = `${baseURL}/api/mcp`;
// A loopback redirect, as a desktop client registers; the browser's request
// to it is answered by the test, standing in for the client.
const REDIRECT = 'http://127.0.0.1:5999/callback';

interface Client {
  id: string;
  name: string;
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  scope: string;
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

// A client with nothing of the user's: no cookie, a bearer token at most.
const outsider = () => playwrightRequest.newContext({ baseURL });

async function register(api: APIRequestContext, endpoint: string, name: string): Promise<Client> {
  const response = await api.post(endpoint, { data: { client_name: name, redirect_uris: [REDIRECT] } });
  expect(response.status()).toBe(201);
  return { id: ((await response.json()) as { client_id: string }).client_id, name };
}

function authorizeUrl(client: Client, challenge: string, overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    client_id: client.id,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
    scope: 'read read_write',
    state: 'state-e2e',
    ...overrides,
  });
  return `/authorize?${params}`;
}

// Stands in for the client at its redirect URI, and answers where the
// browser was sent.
async function answerRedirects(page: Page): Promise<void> {
  await page.route(`${new URL(REDIRECT).origin}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Back at the client.</p>' }),
  );
}

async function redirected(page: Page): Promise<URLSearchParams> {
  await page.waitForURL((url) => url.href.startsWith(REDIRECT));
  return new URL(page.url()).searchParams;
}

let rpcId = 0;

// One MCP request as a 2026-era client sends it; answers the HTTP status and
// the JSON-RPC message.
async function mcp(api: APIRequestContext, token: string, method: string, params: Record<string, unknown>) {
  const response = await api.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
      ...(typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
    },
    data: {
      jsonrpc: '2.0',
      id: ++rpcId,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'promptbook-e2e', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    },
  });
  const body = await response.text();
  const framed = /^data: (.*)$/m.exec(body);
  const json = framed ? framed[1]! : body;
  return { status: response.status(), message: json ? (JSON.parse(json) as Record<string, any>) : {} };
}

// A tool's result, parsed; fails the test on a tool error.
async function tool(api: APIRequestContext, token: string, name: string, args: Record<string, unknown>) {
  const { status, message } = await mcp(api, token, 'tools/call', { name, arguments: args });
  expect(status, `${name} answered ${status}`).toBe(200);
  const result = message.result as { isError?: boolean; content: { text: string }[] };
  expect(result.isError ?? false, `${name}: ${result.content?.[0]?.text}`).toBe(false);
  return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

async function token(api: APIRequestContext, form: Record<string, string>): Promise<Tokens> {
  const response = await api.post('/api/oauth/token', { form });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Tokens;
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
}

// A project of the test's own holding Sabaoth, typed in through the editor.
async function sabaothCopy(page: Page): Promise<string> {
  const { id } = await createProject(page.request, 'Sabaoth per Claude');
  await page.goto(`/projects/${id}`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(sabaoth);
  await expect(page.locator('.ol li .id', { hasText: /^S5$/ }).first()).toBeVisible();
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
  return id;
}

test('Claude connects, writes into open views, refreshes, and stops when revoked', async ({ page }) => {
  const api = await outsider();

  // Discovery from the endpoint's 401, then both metadata documents.
  const challenge = await api.post('/api/mcp', { data: { jsonrpc: '2.0', id: 0, method: 'initialize' } });
  expect(challenge.status()).toBe(401);
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge.headers()['www-authenticate'] ?? '')?.[1];
  expect(metadataUrl).toBe(`${baseURL}/.well-known/oauth-protected-resource/api/mcp`);
  const resource = (await (await api.get(metadataUrl!)).json()) as Record<string, any>;
  expect(resource).toMatchObject({ resource: RESOURCE, authorization_servers: [baseURL] });
  const server = (await (await api.get('/.well-known/oauth-authorization-server')).json()) as Record<string, any>;
  expect(server).toMatchObject({
    issuer: baseURL,
    authorization_endpoint: `${baseURL}/authorize`,
    token_endpoint: `${baseURL}/api/oauth/token`,
    registration_endpoint: `${baseURL}/api/oauth/register`,
    code_challenge_methods_supported: ['S256'],
  });

  const client = await register(api, server.registration_endpoint, `Claude ${Date.now().toString(36)}`);
  const { verifier, challenge: codeChallenge } = pkce();

  // Signed out, the request lands on the sign-in page and comes back intact.
  await throttle(page);
  await answerRedirects(page);
  const path = authorizeUrl(client, codeChallenge);
  await page.goto(path);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: `${client.name} wants to use your Promptbook` })).toBeVisible();
  expect(page.url()).toBe(`${baseURL}${path}`);
  await expect(page.getByText('unverified', { exact: true })).toBeVisible();
  await expect(page.getByText('Request from 127.0.0.1:5999')).toBeVisible();
  await expect(page.getByText(/runs on your own computer/)).toBeVisible();
  await expect(page.getByRole('radio', { name: /Read and edit your projects/ })).toBeChecked();

  await page.getByRole('button', { name: 'Allow' }).click();
  const back = await redirected(page);
  expect(back.get('state')).toBe('state-e2e');
  expect(back.get('iss')).toBe(baseURL);
  const first = await token(api, {
    grant_type: 'authorization_code',
    code: back.get('code')!,
    redirect_uri: REDIRECT,
    client_id: client.id,
    code_verifier: verifier,
  });
  expect(first.scope).toBe('read_write');
  expect(first.access_token).toMatch(/^pb_at_/);

  // A brainstorm entry reaches an open Brainstorm log without a reload.
  const id = await sabaothCopy(page);
  await open(page, `/projects/${id}/log`);
  const title = `Il cordone, seconda idea ${Date.now().toString(36)}`;
  const entry = await tool(api, first.access_token, 'add_brainstorm_entry', {
    projectId: id,
    title,
    ideas: ['Donato chiede aiuto a Ignazio'],
    decisions: ['Il tamburo resta'],
    rejected: [{ idea: 'Un secondo tenente', why: 'Troppi PNG' }],
    questions: ['Chi suona il tamburo?'],
  });
  expect(entry.entry.by).toBe('claude');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // A section edit reaches an open Document view with its banner; Undo puts
  // the text back.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Document' }).click();
  // The editor draws only the lines in view: S3 is brought there first.
  await page
    .locator('.ol li')
    .filter({ has: page.locator('.id', { hasText: /^S3$/ }) })
    .first()
    .click();
  await expect(page.locator('.cm-content')).toContainText('Un tamburo batte da solo.');
  const read = await tool(api, first.access_token, 'read_document', { projectId: id, target: 'S3' });
  const edited = await tool(api, first.access_token, 'replace_section', {
    projectId: id,
    target: 'S3',
    markdown: (read.text as string).replace('Un tamburo batte da solo.', 'Un tamburo batte, lento.'),
    hash: read.hash,
  });
  expect(edited.snapshotId).toBeTruthy();
  await expect(page.locator('.cm-content')).toContainText('Un tamburo batte, lento.');
  const banner = page.locator('.claude-banner');
  await expect(banner).toContainText('S3');
  await banner.getByRole('button', { name: 'Undo' }).click();
  await page
    .getByRole('dialog', { name: "Undo Claude's edit?" })
    .getByRole('button', { name: 'Undo the edit' })
    .click();
  await expect(page.locator('.cm-content')).toContainText('Un tamburo batte da solo.');
  await expect(page.locator('.cm-content')).not.toContainText('Un tamburo batte, lento.');
  await expect(banner).toHaveCount(0);

  // Refresh: a new pair, and the new access token works.
  const second = await token(api, {
    grant_type: 'refresh_token',
    refresh_token: first.refresh_token,
    client_id: client.id,
  });
  expect(second.refresh_token).not.toBe(first.refresh_token);
  const listed = await tool(api, second.access_token, 'list_projects', {});
  expect(JSON.stringify(listed)).toContain(id);

  // Revoked in Connected apps, the next call is refused.
  await page.goto('/settings/apps');
  const row = page.getByRole('row').filter({ hasText: client.name });
  await expect(row).toContainText('Read and edit');
  await row.getByRole('button', { name: `Revoke ${client.name}` }).click();
  await page
    .getByRole('dialog', { name: `Revoke ${client.name}?` })
    .getByRole('button', { name: 'Revoke' })
    .click();
  await expect(row).toHaveCount(0);
  const after = await mcp(api, second.access_token, 'tools/call', { name: 'list_projects', arguments: {} });
  expect(after.status).toBe(401);
  await api.dispose();
});

test('the authorize page refuses a bad request, cannot be framed, and Deny sends the client back', async ({ page }) => {
  const api = await outsider();
  await signIn(page);
  await answerRedirects(page);
  const client = await register(api, '/api/oauth/register', `Denied ${Date.now().toString(36)}`);
  const { challenge } = pkce();

  // A wrong resource: the error, and no redirect.
  const response = await page.goto(authorizeUrl(client, challenge, { resource: 'https://elsewhere.example/api/mcp' }));
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
  await expect(page.getByRole('heading', { name: 'Cannot connect' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('issues tokens for');
  await expect(page.getByRole('button', { name: 'Allow' })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/authorize');

  // An approval from another site is refused, with the user's cookie.
  const valid = new URLSearchParams(authorizeUrl(client, challenge).split('?')[1]);
  const crossSite = await page.request.post('/api/oauth/authorize', {
    headers: { origin: 'https://evil.example' },
    data: { ...Object.fromEntries(valid), granted_scope: 'read' },
  });
  expect(crossSite.status()).toBe(403);

  // Deny: back to the client with access_denied, and nothing granted.
  await page.goto(authorizeUrl(client, challenge));
  await page.getByRole('button', { name: 'Deny' }).click();
  const back = await redirected(page);
  expect(back.get('error')).toBe('access_denied');
  expect(back.get('state')).toBe('state-e2e');
  expect(back.get('code')).toBeNull();
  const { grants } = (await (await page.request.get('/api/auth/grants')).json()) as {
    grants: { client_name: string }[];
  };
  expect(grants.some((g) => g.client_name === client.name)).toBe(false);
  await api.dispose();
});

test('History saves, compares and restores; Inspiration and Research by hand', async ({ page }) => {
  await signIn(page);
  const { id } = await createProject(page.request, 'Storia e ricerca');

  // History: a named snapshot, a line typed after it, Compare, Restore.
  await open(page, `/projects/${id}/history`);
  await page.getByLabel('Snapshot name').fill('prima della lettura');
  await page.getByRole('button', { name: 'Save snapshot' }).click();
  const saved = page.getByRole('row').filter({ hasText: 'prima della lettura' });
  await expect(saved).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Document' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nUna riga dopo la foto.');
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'History' }).click();
  await saved.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('heading', { name: 'Compare' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Changes from the snapshot to now' })).toContainText(
    'Una riga dopo la foto.',
  );
  await page.getByRole('button', { name: 'Restore this version' }).click();
  await page.getByRole('dialog', { name: 'Restore this version?' }).getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Document' }).click();
  await expect(page.locator('.cm-content')).toContainText('titolo: Storia e ricerca');
  await expect(page.locator('.cm-content')).not.toContainText('Una riga dopo la foto.');

  // Inspiration: an item added by hand.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Inspiration' }).click();
  await page.getByLabel('Kind').selectOption({ label: 'Quote' });
  await page.getByLabel('Text').fill('Il mare si ritirò, poi tornò.');
  await page.getByLabel('Why it matters').fill("L'onda del 1908");
  await page.getByRole('button', { name: 'Add item' }).click();
  const item = page.locator('.item', { hasText: 'Il mare si ritirò, poi tornò.' });
  await expect(item).toContainText("L'onda del 1908");
  await expect(item).toContainText('You');

  // Research: a note made, edited and deleted.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Research' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Topic', { exact: true }).fill('Il terremoto del 1908');
  await page.getByLabel('Summary').fill('Alle 5:20 del 28 dicembre.');
  await page.getByLabel('Facts for the table').fill('Trentasette secondi\nIl maremoto dopo dieci minuti');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Il terremoto del 1908' })).toBeVisible();
  await expect(page.locator('.fact-list li')).toHaveCount(2);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Summary').fill('Alle 5:20 del 28 dicembre 1908.');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.sum')).toHaveText('Alle 5:20 del 28 dicembre 1908.');

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete this note?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No notes yet.')).toBeVisible();
});
