import { describe, expect, it } from 'vitest';
import { loadConfig, loadDatabaseUrl } from '../../src/config.js';

const base = { DATABASE_URL: 'postgres://pb:pb@localhost:5432/promptbook', PUBLIC_URL: 'http://localhost:8090/' };

describe('configuration', () => {
  it('reads the defaults', () => {
    expect(loadConfig(base)).toEqual({
      databaseUrl: base.DATABASE_URL,
      publicOrigin: 'http://localhost:8090',
      port: 3000,
      sessionTtlHours: 720,
      trustProxyHops: 0,
      admin: null,
      webDist: null,
    });
  });

  it('reads every variable', () => {
    expect(
      loadConfig({
        ...base,
        PUBLIC_URL: 'https://promptbook.example/app',
        PORT: '8080',
        SESSION_TTL_HOURS: '24',
        TRUST_PROXY_HOPS: '1',
        PROMPTBOOK_ADMIN_USERNAME: 'steve',
        PROMPTBOOK_ADMIN_PASSWORD: '14-characters!',
        WEB_DIST: '/srv/web',
      }),
    ).toEqual({
      databaseUrl: base.DATABASE_URL,
      publicOrigin: 'https://promptbook.example',
      port: 8080,
      sessionTtlHours: 24,
      trustProxyHops: 1,
      admin: { username: 'steve', password: '14-characters!' },
      webDist: '/srv/web',
    });
  });

  it('names the variable that is missing or wrong', () => {
    expect(() => loadConfig({ PUBLIC_URL: base.PUBLIC_URL })).toThrow(/DATABASE_URL is required/);
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/PUBLIC_URL is required/);
    expect(() => loadConfig({ ...base, PUBLIC_URL: 'localhost:8090' })).toThrow(/PUBLIC_URL must be a http: or https: URL/);
    expect(() => loadConfig({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL must be a postgres:/);
    expect(() => loadConfig({ ...base, PORT: 'eighty' })).toThrow(/PORT must be a whole number/);
    expect(() => loadConfig({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS must be a whole number of at least 0/);
    expect(() => loadConfig({ ...base, PROMPTBOOK_ADMIN_USERNAME: 'steve' })).toThrow(
      /PROMPTBOOK_ADMIN_USERNAME and PROMPTBOOK_ADMIN_PASSWORD must be set together/,
    );
  });

  it('needs only the database for the command line', () => {
    expect(loadDatabaseUrl({ DATABASE_URL: base.DATABASE_URL })).toBe(base.DATABASE_URL);
    expect(() => loadDatabaseUrl({})).toThrow(/DATABASE_URL is required/);
  });
});
