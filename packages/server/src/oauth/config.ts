// The OAuth 2.1 authorization server behind the MCP endpoint (connector design
// decision 7), ported from gdrarchive. Every address derives from PUBLIC_URL's
// origin and from nothing a request says: RFC 8414 wants the issuer to equal
// where the metadata was found, and RFC 8707 wants a token's audience to be
// one stable resource, so a server reached by two names must not mint tokens
// for two.

export const MCP_PATH = '/api/mcp';

export interface OAuthConfig {
  // The origin only, so the metadata lives at the root well-known paths.
  issuer: string;
  // The RFC 8707 resource every token is bound to.
  resource: string;
  // The web page /authorize, behind the app's own sign-in.
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
  // Where the 401 challenge sends a client that holds no token yet.
  resourceMetadataUrl: string;
}

export function oauthConfig(publicOrigin: string): OAuthConfig {
  return {
    issuer: publicOrigin,
    resource: `${publicOrigin}${MCP_PATH}`,
    authorizationEndpoint: `${publicOrigin}/authorize`,
    tokenEndpoint: `${publicOrigin}/api/oauth/token`,
    registrationEndpoint: `${publicOrigin}/api/oauth/register`,
    revocationEndpoint: `${publicOrigin}/api/oauth/revoke`,
    resourceMetadataUrl: `${publicOrigin}/.well-known/oauth-protected-resource${MCP_PATH}`,
  };
}

// What a grant lets a client do: read, or read and change. read_write
// includes read.
export const OAUTH_SCOPES = ['read', 'read_write'] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

// The scopes of a space-separated scope parameter, each once; null when one is
// unknown. None asked means read.
export function parseScopeParameter(value: string | undefined): OAuthScope[] | null {
  if (value === undefined || value.trim() === '') return ['read'];
  const scopes: OAuthScope[] = [];
  for (const part of value.trim().split(/\s+/)) {
    if (part !== 'read' && part !== 'read_write') return null;
    if (!scopes.includes(part)) scopes.push(part);
  }
  return scopes;
}

// True when the scope granted is no wider than what was asked: a client that
// asked for read_write has asked for read too.
export function scopeWithin(granted: OAuthScope, requested: readonly OAuthScope[]): boolean {
  if (requested.includes(granted)) return true;
  return granted === 'read' && requested.includes('read_write');
}
