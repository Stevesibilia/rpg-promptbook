import type { OAuthScope } from '../api.js';

// The consent page's pure parts (connector design decision 8).

// The parameters of an authorization request the page sends back to the
// server, unchanged. Anything else in the address stays behind.
const FORWARDED = [
  'client_id',
  'redirect_uri',
  'response_type',
  'code_challenge',
  'code_challenge_method',
  'resource',
  'scope',
  'state',
] as const;

export function forwardedParameters(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const forwarded: Record<string, string> = {};
  for (const name of FORWARDED) {
    const value = params.get(name);
    if (value !== null) forwarded[name] = value;
  }
  return forwarded;
}

// Where a client's name comes from: the host serving its metadata document
// when the client id is one (an https URL with a path, as the server decides),
// or null for a registered client, whose name anyone could have chosen.
export function nameSource(clientId: string): string | null {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  return url.protocol === 'https:' && url.pathname !== '/' && url.pathname !== '' ? url.host : null;
}

// The widest scope asked for is offered first; narrowing it is the choice.
export const defaultScope = (requested: OAuthScope[]): OAuthScope =>
  requested.includes('read_write') ? 'read_write' : 'read';
