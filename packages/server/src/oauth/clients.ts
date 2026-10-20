import { randomUUID } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { isIPv4, isIPv6 } from 'node:net';
import type { Db, Queryable } from '../db.js';
import { AppError } from '../errors.js';

// Who is asking, in the two ways the MCP authorization specification allows
// (connector design decision 7, ported from gdrarchive). A client ID metadata
// document is preferred: the client_id is an https URL, and the document at
// it names the client and where it may be sent. Dynamic registration (RFC
// 7591) is what clients in use today still expect, so it stays, for public
// clients only.
//
// Fetching a document is a server-side request to a URL the caller chose, and
// is guarded as such: https only, no redirects, a size cap, a deadline, and no
// connection to an address that is not publicly routable. The address is
// checked at connect time, in the lookup the socket uses, so a name that
// resolves differently the second time cannot reach the private network.

const MAX_DOCUMENT_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
// However long the document asks to be cached, never longer than this.
const MAX_CACHE_MS = 3_600_000;
// A registered client nobody approved is swept after this long.
const UNUSED_CLIENT_HOURS = 24;
// Registrations per address per window. There is no secret to guess here:
// the limit bounds how many rows an unauthenticated caller can create.
const REGISTRATIONS_PER_WINDOW = 30;
export const REGISTRATION_WINDOW_MINUTES = 15;
// Registered clients nobody approved, across every address: past this,
// registration waits for the sweep, so the table cannot grow without bound.
const UNAPPROVED_CLIENTS_MAX = 1000;

export type OAuthClientKind = 'registered' | 'metadata_document';

// The desktop app's client, seeded by migration 004.
export const DESKTOP_CLIENT_ID = 'promptbook-desktop';

export interface OAuthClient {
  // The row's id, which a grant references.
  id: string;
  clientId: string;
  kind: OAuthClientKind;
  clientName: string;
  // https, or http on a loopback host; never shown as a link.
  clientUri: string | null;
  redirectUris: string[];
  // The desktop app: the app resource only, no consent question, never swept.
  firstParty: boolean;
}

interface ClientRow {
  id: string;
  client_id: string;
  kind: OAuthClientKind;
  client_name: string;
  client_uri: string | null;
  redirect_uris: unknown;
  first_party: boolean;
}

const toClient = (row: ClientRow): OAuthClient => ({
  id: row.id,
  clientId: row.client_id,
  kind: row.kind,
  clientName: row.client_name,
  clientUri: row.client_uri,
  redirectUris: Array.isArray(row.redirect_uris)
    ? row.redirect_uris.filter((u): u is string => typeof u === 'string')
    : [],
  firstParty: row.first_party,
});

const COLUMNS = 'id, client_id, kind, client_name, client_uri, redirect_uris, first_party';

// Redirect URIs.

// The loopback host names, whose port is ignored (OAuth 2.1 section 10.2): a
// native client binds whichever port is free. localhost included: Claude Code
// declares http://localhost/callback and comes back on a free port.
// URL.hostname keeps the brackets on an IPv6 literal.
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '[::1]', 'localhost']);

function parsed(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

export function isLoopbackRedirectUri(uri: string): boolean {
  const url = parsed(uri);
  return url !== null && LOOPBACK_HOSTNAMES.has(url.hostname);
}

// https, or plain http on a loopback host. Private-use schemes are refused:
// the consent page could not say where they lead.
export function isAcceptableRedirectUri(uri: string): boolean {
  const url = parsed(uri);
  if (!url) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname);
}

// An exact match against what the client registered or declared, except the
// port of a loopback URI; everything else must still agree, so
// http://localhost.evil.example:1/callback is not a loopback URI at all.
export function validateRedirectUri(client: OAuthClient, uri: string): boolean {
  if (!isAcceptableRedirectUri(uri)) return false;
  if (client.redirectUris.includes(uri)) return true;
  const presented = parsed(uri);
  if (!presented || !LOOPBACK_HOSTNAMES.has(presented.hostname)) return false;
  return client.redirectUris.some((registered) => {
    const candidate = parsed(registered);
    return (
      candidate !== null &&
      LOOPBACK_HOSTNAMES.has(candidate.hostname) &&
      candidate.protocol === presented.protocol &&
      candidate.hostname === presented.hostname &&
      candidate.pathname === presented.pathname &&
      candidate.search === presented.search &&
      candidate.hash === presented.hash
    );
  });
}

// A client's own address as the client states it, kept only when it is one
// this server would send a browser to: https, or http on a loopback host.
// Anything else is dropped rather than stored. No logo is kept at all:
// nothing shows one.
export function safeClientUri(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 2048 && isAcceptableRedirectUri(value) ? value : null;
}

// True when the client can only ever send the user to their own machine,
// where any program could be listening: the consent page warns.
export function isLoopbackOnlyClient(client: OAuthClient): boolean {
  return client.redirectUris.length > 0 && client.redirectUris.every(isLoopbackRedirectUri);
}

// Which addresses this server connects to.

function ipv4IsPublic(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return false; // this network
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 192 && b === 0) return false; // protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51) return false; // TEST-NET-2
  if (a === 203 && b === 0) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

// The eight 16-bit groups of an IPv6 literal, or null. Groups rather than
// patterns on the text: new URL folds ::ffff:127.0.0.1 into ::ffff:7f00:1, so
// a rule on the dotted form alone would miss it.
export function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().replace(/^\[|\]$/g, '');
  const dotted = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (dotted) {
    const octets = dotted[1]!.split('.').map(Number) as [number, number, number, number];
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, dotted.index)}${high}:${low}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const piece of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      groups.push(parseInt(piece, 16));
    }
    return groups;
  };
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

const embeddedIpv4 = (groups: number[]): string => {
  const high = groups[6]!;
  const low = groups[7]!;
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
};

function ipv6IsPublic(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const leading = groups.slice(0, 6);
  const allZero = leading.every((group) => group === 0);
  // ::1 and ::.
  if (allZero && groups[6] === 0 && (groups[7] === 0 || groups[7] === 1)) return false;
  // IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) and NAT64
  // (64:ff9b::/96) addresses reach an IPv4 destination: judge that one.
  const mapped = leading.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  // IPv4-translated (::ffff:0:0:0/96): never a destination to connect to.
  if (groups.slice(0, 4).every((group) => group === 0) && groups[4] === 0xffff && groups[5] === 0) return false;
  const nat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0);
  if (mapped || nat64 || allZero) return ipv4IsPublic(embeddedIpv4(groups));
  const first = groups[0]!;
  if (first === 0x2002) return false; // 6to4
  if (first === 0x2001 && groups[1] === 0) return false; // Teredo
  if (first === 0x64 && groups[1] === 0xff9b && groups[2] === 1) return false; // local-use NAT64
  if ((first & 0xfe00) === 0xfc00) return false; // unique local
  if ((first & 0xffc0) === 0xfe80) return false; // link-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && groups[1] === 0x0db8) return false; // documentation
  if (first === 0x0100 && groups.slice(1, 4).every((group) => group === 0)) return false; // discard
  return true;
}

export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return ipv4IsPublic(address);
  if (isIPv6(address)) return ipv6IsPublic(address);
  return false;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

// The lookup the request connects with: every address a name resolves to
// must be public, checked here rather than in a separate resolution before.
function guardedLookup(hostname: string, options: object, callback: LookupCallback): void {
  dnsLookup(hostname, options as never, (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => {
    if (err) return callback(err, '', family);
    const addresses: LookupAddress[] = Array.isArray(address)
      ? (address as LookupAddress[])
      : [{ address: String(address), family: family ?? 4 }];
    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
      return callback(
        Object.assign(new Error(`${hostname} resolves to an address this server will not connect to`), {
          code: 'EPRIVATEADDRESS',
        }),
        '',
        family,
      );
    }
    if (Array.isArray(address)) return callback(null, addresses, family);
    return callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

interface FetchedDocument {
  body: string;
  cacheMs: number;
}

// One https URL read under every guard, or an error.
function fetchDocument(url: URL): Promise<FetchedDocument> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  // An address literal never reaches the lookup: node connects to it
  // directly. So it is checked here, and the lookup covers names.
  if ((isIPv4(hostname) || isIPv6(hostname)) && !isPublicAddress(hostname)) {
    return Promise.reject(new Error(`${url.hostname} is an address this server will not connect to`));
  }
  return new Promise<FetchedDocument>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { accept: 'application/json', host: url.host },
        lookup: guardedLookup as never,
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        // No redirects: a redirect is how a public URL becomes a private
        // destination, and a metadata document has no reason to move.
        if (status >= 300 && status < 400) {
          res.destroy();
          return reject(new Error(`the document at ${url.href} redirected (${status})`));
        }
        if (status !== 200) {
          res.destroy();
          return reject(new Error(`the document at ${url.href} answered ${status}`));
        }
        const tooLarge = () => new Error(`the document at ${url.href} is larger than ${MAX_DOCUMENT_BYTES} bytes`);
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) {
          res.destroy();
          return reject(tooLarge());
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_DOCUMENT_BYTES) {
            res.destroy();
            reject(tooLarge());
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            cacheMs: cacheLifetimeMs(res.headers['cache-control']),
          }),
        );
        res.on('error', reject);
      },
    );
    // The timeout option fires on an idle socket; this deadline bounds the
    // whole read, a slow trickle included.
    const deadline = setTimeout(
      () => req.destroy(new Error(`the document at ${url.href} did not answer within ${FETCH_TIMEOUT_MS} ms`)),
      FETCH_TIMEOUT_MS,
    );
    req.on('timeout', () =>
      req.destroy(new Error(`the document at ${url.href} did not answer within ${FETCH_TIMEOUT_MS} ms`)),
    );
    req.on('error', reject);
    req.on('close', () => clearTimeout(deadline));
    req.end();
  });
}

// How long a document asks to be believed, at most an hour; none on
// no-store or no-cache.
export function cacheLifetimeMs(header: string | string[] | undefined): number {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (!value) return MAX_CACHE_MS;
  if (/\b(no-store|no-cache)\b/i.test(value)) return 0;
  const maxAge = /\bmax-age\s*=\s*(\d+)/i.exec(value);
  if (!maxAge) return MAX_CACHE_MS;
  return Math.min(Number(maxAge[1]) * 1000, MAX_CACHE_MS);
}

// Resolving a client id.

// An https URL with a path other than / is a client ID metadata document.
export function isMetadataDocumentId(clientId: string): boolean {
  const url = parsed(clientId);
  return url !== null && url.protocol === 'https:' && url.pathname !== '/' && url.pathname !== '';
}

// One code whatever the reason, the reason in the message: the consent page
// shows it to the person deciding whether to trust the client.
const invalidClient = (reason: string) =>
  new AppError(400, 'invalid_client', `That client could not be identified: ${reason}`);

// The client behind a client_id, fetching and caching its metadata document
// when it is one; null when nothing recognises it. A metadata document that
// cannot be believed is invalid_client, not "no such client".
export async function resolveClient(db: Queryable, clientId: string): Promise<OAuthClient | null> {
  if (!clientId) return null;
  if (!isMetadataDocumentId(clientId)) {
    const row = await db.queryOne<ClientRow>(
      `select ${COLUMNS} from oauth_clients where client_id = $1 and kind = 'registered'`,
      [clientId],
    );
    return row ? toClient(row) : null;
  }
  const cached = await db.queryOne<ClientRow>(
    `select ${COLUMNS} from oauth_clients
     where client_id = $1 and kind = 'metadata_document' and metadata_expires_at > now()`,
    [clientId],
  );
  if (cached) return toClient(cached);
  return upsertMetadataDocumentClient(db, clientId);
}

async function upsertMetadataDocumentClient(db: Queryable, clientId: string): Promise<OAuthClient> {
  let fetched: FetchedDocument;
  try {
    fetched = await fetchDocument(new URL(clientId));
  } catch (error) {
    throw invalidClient(error instanceof Error ? error.message : 'its metadata document could not be read');
  }
  let document: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(fetched.body);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
    document = value as Record<string, unknown>;
  } catch {
    throw invalidClient('its metadata document is not a JSON object');
  }
  // The document names itself exactly; otherwise a document hosted anywhere
  // could claim any client_id.
  if (document.client_id !== clientId) throw invalidClient('its metadata document names a different client_id');
  const name = typeof document.client_name === 'string' ? document.client_name.trim() : '';
  if (!name) throw invalidClient('its metadata document has no client_name');
  const uris = Array.isArray(document.redirect_uris)
    ? document.redirect_uris.filter((u): u is string => typeof u === 'string' && u.length <= 2048)
    : [];
  if (uris.length === 0) throw invalidClient('its metadata document has no redirect_uris');
  if (!uris.every(isAcceptableRedirectUri)) {
    throw invalidClient('its metadata document declares a redirect URI that is neither loopback nor https');
  }
  const row = await db.queryOne<ClientRow>(
    `insert into oauth_clients (client_id, kind, client_name, client_uri, redirect_uris, metadata_expires_at)
     values ($1, 'metadata_document', $2, $3, $4::jsonb, $5)
     on conflict (client_id) do update
       set client_name = excluded.client_name, client_uri = excluded.client_uri,
           redirect_uris = excluded.redirect_uris, metadata_expires_at = excluded.metadata_expires_at
       where oauth_clients.kind = 'metadata_document'
     returning ${COLUMNS}`,
    [
      clientId,
      name.slice(0, 200),
      safeClientUri(document.client_uri),
      JSON.stringify(uris),
      new Date(Date.now() + fetched.cacheMs),
    ],
  );
  if (!row) throw invalidClient('its metadata document could not be recorded');
  return toClient(row);
}

// Dynamic registration.

export class RegistrationError extends Error {
  constructor(
    readonly code: 'invalid_client_metadata' | 'invalid_redirect_uri',
    message: string,
  ) {
    super(message);
  }
}

export interface Registration {
  clientName: string;
  redirectUris: string[];
  clientUri?: string | undefined;
  tokenEndpointAuthMethod?: string | undefined;
}

// Registers a public client. Unauthenticated by nature, so bounded rather
// than gated: a throttle per address, and the sweep of clients nobody
// approved. Counted after the checks, so a refused request costs nothing.
export async function registerClient(db: Db, registration: Registration, ip: string): Promise<OAuthClient> {
  if ((registration.tokenEndpointAuthMethod ?? 'none') !== 'none') {
    throw new RegistrationError(
      'invalid_client_metadata',
      'This server issues no client secrets and registers public clients only. Set token_endpoint_auth_method to "none".',
    );
  }
  const invalid = registration.redirectUris.find((uri) => !isAcceptableRedirectUri(uri));
  if (invalid !== undefined) {
    throw new RegistrationError(
      'invalid_redirect_uri',
      `${invalid} is neither a loopback address nor an https URL, and cannot be registered.`,
    );
  }
  await sweepUnusedClients(db);
  await reserveRegistration(db, registrationKey(ip));
  const row = await db.queryOne<ClientRow>(
    `insert into oauth_clients (client_id, kind, client_name, client_uri, redirect_uris)
     values ($1, 'registered', $2, $3, $4::jsonb)
     returning ${COLUMNS}`,
    [randomUUID(), registration.clientName, safeClientUri(registration.clientUri), JSON.stringify(registration.redirectUris)],
  );
  return toClient(row!);
}

// What registrations are counted against: the address, or for IPv6 its /64,
// which one machine usually holds whole. An IPv4 address written as IPv6 is
// the IPv4 address.
export function registrationKey(ip: string): string {
  if (isIPv4(ip)) return ip;
  const groups = isIPv6(ip) ? ipv6Groups(ip) : null;
  if (!groups) return ip;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) return embeddedIpv4(groups);
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

const tooMany = (message: string) => new AppError(429, 'too_many_registrations', message);

// Counts the registration against its address, under one lock for every
// registration, so a burst cannot all read the counts before any of them is
// recorded; and refuses while too many registered clients wait unapproved.
async function reserveRegistration(db: Db, key: string): Promise<void> {
  await db.withTransaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended('promptbook-oauth-register', 0))");
    const unapproved = await tx.queryOne<{ n: string }>(
      `select count(*) as n from oauth_clients c
       where c.kind = 'registered' and not c.first_party
         and not exists (select 1 from oauth_grants g where g.client_id = c.id)`,
    );
    if (Number(unapproved?.n) >= UNAPPROVED_CLIENTS_MAX) {
      throw tooMany('Too many clients are waiting for approval on this server: try again later.');
    }
    const count = await tx.queryOne<{ n: string }>(
      `select count(*) as n from oauth_registrations
       where ip = $1::inet and at > now() - make_interval(mins => $2)`,
      [key, REGISTRATION_WINDOW_MINUTES],
    );
    if (Number(count?.n) >= REGISTRATIONS_PER_WINDOW) {
      throw tooMany(
        `Too many client registrations from this address: wait ${REGISTRATION_WINDOW_MINUTES} minutes and try again.`,
      );
    }
    await tx.query('insert into oauth_registrations (ip) values ($1::inet)', [key]);
  });
}

// Registered clients nobody approved within a day, and metadata document
// clients whose cached document has expired and that nobody approved (a
// later request fetches the document again). The first-party client stays:
// the migration made it, and nothing would make it again.
export async function sweepUnusedClients(db: Queryable): Promise<number> {
  const rows = await db.query(
    `delete from oauth_clients c
     where ((c.kind = 'registered' and c.created_at < now() - make_interval(hours => $1))
            or (c.kind = 'metadata_document' and c.metadata_expires_at < now()))
       and not c.first_party
       and not exists (select 1 from oauth_grants g where g.client_id = c.id)
     returning c.id`,
    [UNUSED_CLIENT_HOURS],
  );
  return rows.length;
}

export const clientLimits = {
  MAX_DOCUMENT_BYTES,
  FETCH_TIMEOUT_MS,
  MAX_CACHE_MS,
  UNUSED_CLIENT_HOURS,
  REGISTRATIONS_PER_WINDOW,
  UNAPPROVED_CLIENTS_MAX,
};
