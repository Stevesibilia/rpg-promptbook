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
      oidc: null,
      webDist: null,
      appVersion: 'dev',
      dataDir: './data',
      filesQuotaGb: 20,
      filesGraceDays: 30,
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
        APP_VERSION: 'v0.1.0',
        PROMPTBOOK_DATA_DIR: '/data',
        PROMPTBOOK_FILES_QUOTA_GB: '5',
        PROMPTBOOK_FILES_GRACE_DAYS: '7',
      }),
    ).toEqual({
      databaseUrl: base.DATABASE_URL,
      publicOrigin: 'https://promptbook.example',
      port: 8080,
      sessionTtlHours: 24,
      trustProxyHops: 1,
      admin: { username: 'steve', password: '14-characters!' },
      oidc: null,
      webDist: '/srv/web',
      appVersion: 'v0.1.0',
      dataDir: '/data',
      filesQuotaGb: 5,
      filesGraceDays: 7,
    });
  });

  it('names the variable that is missing or wrong', () => {
    expect(() => loadConfig({ PUBLIC_URL: base.PUBLIC_URL })).toThrow(/DATABASE_URL is required/);
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/PUBLIC_URL is required/);
    expect(() => loadConfig({ ...base, PUBLIC_URL: 'localhost:8090' })).toThrow(/PUBLIC_URL must be a http: or https: URL/);
    expect(() => loadConfig({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL must be a postgres:/);
    expect(() => loadConfig({ ...base, PORT: 'eighty' })).toThrow(/PORT must be a whole number/);
    expect(() => loadConfig({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS must be a whole number of at least 0/);
    expect(() => loadConfig({ ...base, PROMPTBOOK_FILES_QUOTA_GB: '0' })).toThrow(
      /PROMPTBOOK_FILES_QUOTA_GB must be a whole number of at least 1/,
    );
    expect(() => loadConfig({ ...base, PROMPTBOOK_FILES_QUOTA_GB: '2.5' })).toThrow(/PROMPTBOOK_FILES_QUOTA_GB/);
    expect(() => loadConfig({ ...base, PROMPTBOOK_FILES_GRACE_DAYS: '0' })).toThrow(
      /PROMPTBOOK_FILES_GRACE_DAYS must be a whole number of at least 1/,
    );
    expect(() => loadConfig({ ...base, PROMPTBOOK_FILES_GRACE_DAYS: 'a month' })).toThrow(/PROMPTBOOK_FILES_GRACE_DAYS/);
    expect(() => loadConfig({ ...base, PROMPTBOOK_ADMIN_USERNAME: 'steve' })).toThrow(
      /PROMPTBOOK_ADMIN_USERNAME and PROMPTBOOK_ADMIN_PASSWORD must be set together/,
    );
  });

  describe('single sign-on', () => {
    const oidc = {
      OIDC_ISSUER: 'https://auth.example/application/o/rpg-promptbook/',
      OIDC_CLIENT_ID: 'client',
      OIDC_CLIENT_SECRET: 'secret',
    };

    it('turns on with the three variables, with defaults from PUBLIC_URL', () => {
      expect(loadConfig({ ...base, ...oidc }).oidc).toEqual({
        issuer: oidc.OIDC_ISSUER,
        clientId: 'client',
        clientSecret: 'secret',
        providerName: 'single sign-on',
        redirectUri: 'http://localhost:8090/api/auth/oidc/callback',
      });
    });

    it('reads the provider name and the redirect URI', () => {
      expect(
        loadConfig({
          ...base,
          ...oidc,
          PUBLIC_URL: 'https://promptbook.example/app',
          OIDC_PROVIDER_NAME: 'Authentik',
          OIDC_REDIRECT_URI: 'https://promptbook.example/api/auth/oidc/callback',
        }).oidc,
      ).toMatchObject({ providerName: 'Authentik', redirectUri: 'https://promptbook.example/api/auth/oidc/callback' });
    });

    it('wants the redirect URI to be the callback route at PUBLIC_URL', () => {
      for (const uri of [
        'https://localhost:8090/api/auth/oidc/callback',
        'http://localhost:8091/api/auth/oidc/callback',
        'http://promptbook.example/api/auth/oidc/callback',
        'http://localhost:8090/api/auth/oidc/callback/',
        'http://localhost:8090/callback',
        'http://localhost:8090/api/auth/oidc/callback?next=/',
      ]) {
        expect(() => loadConfig({ ...base, ...oidc, OIDC_REDIRECT_URI: uri })).toThrow(
          /OIDC_REDIRECT_URI must be http:\/\/localhost:8090\/api\/auth\/oidc\/callback/,
        );
      }
    });

    it('names the variables missing from a partial setup', () => {
      expect(() => loadConfig({ ...base, OIDC_ISSUER: oidc.OIDC_ISSUER })).toThrow(
        /OIDC_CLIENT_ID and OIDC_CLIENT_SECRET must be set with OIDC_ISSUER/,
      );
      expect(() => loadConfig({ ...base, OIDC_CLIENT_ID: 'client', OIDC_CLIENT_SECRET: 'secret' })).toThrow(
        /OIDC_ISSUER must be set with OIDC_CLIENT_ID and OIDC_CLIENT_SECRET/,
      );
      expect(() => loadConfig({ ...base, ...oidc, OIDC_CLIENT_SECRET: '  ' })).toThrow(/OIDC_CLIENT_SECRET must be set/);
      expect(() => loadConfig({ ...base, ...oidc, OIDC_ISSUER: 'auth.example' })).toThrow(
        /OIDC_ISSUER must be a http: or https: URL/,
      );
    });

    it('refuses the admin variables with single sign-on', () => {
      const admin = { PROMPTBOOK_ADMIN_USERNAME: 'steve', PROMPTBOOK_ADMIN_PASSWORD: '14-characters!' };
      expect(() => loadConfig({ ...base, ...oidc, ...admin })).toThrow(/cannot be used with single sign-on/);
      expect(() => loadConfig({ ...base, ...oidc, PROMPTBOOK_ADMIN_USERNAME: 'steve' })).toThrow(
        /PROMPTBOOK_ADMIN_USERNAME and PROMPTBOOK_ADMIN_PASSWORD/,
      );
    });
  });

  it('needs only the database for the command line', () => {
    expect(loadDatabaseUrl({ DATABASE_URL: base.DATABASE_URL })).toBe(base.DATABASE_URL);
    expect(() => loadDatabaseUrl({})).toThrow(/DATABASE_URL is required/);
  });
});
