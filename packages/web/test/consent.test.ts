import { describe, expect, it } from 'vitest';
import { defaultScope, forwardedParameters, nameSource } from '../src/connect/consent.js';

describe('the consent page', () => {
  it('sends back the request parameters only, unchanged', () => {
    const search =
      '?client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&response_type=code' +
      '&code_challenge=x&code_challenge_method=S256&resource=http%3A%2F%2Flocalhost%3A8090%2Fapi%2Fmcp' +
      '&scope=read+read_write&state=s%26t&sign_in=failed&extra=1';
    expect(forwardedParameters(search)).toEqual({
      client_id: 'abc',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      response_type: 'code',
      code_challenge: 'x',
      code_challenge_method: 'S256',
      resource: 'http://localhost:8090/api/mcp',
      scope: 'read read_write',
      state: 's&t',
    });
    expect(forwardedParameters('')).toEqual({});
  });

  it('names the host of a metadata document client id, and nothing for a registered client', () => {
    expect(nameSource('https://claude.ai/oauth/claude-client.json')).toBe('claude.ai');
    expect(nameSource('https://claude.ai/')).toBeNull();
    expect(nameSource('http://claude.ai/client.json')).toBeNull();
    expect(nameSource('6f1c2a0e-6c55-4a4e-9a51-0e6c1c3b9d7a')).toBeNull();
    expect(nameSource('')).toBeNull();
  });

  it('offers the widest scope asked for first', () => {
    expect(defaultScope(['read', 'read_write'])).toBe('read_write');
    expect(defaultScope(['read_write'])).toBe('read_write');
    expect(defaultScope(['read'])).toBe('read');
  });
});
