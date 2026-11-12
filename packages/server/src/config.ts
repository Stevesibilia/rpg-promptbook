import { z } from 'zod';

// The server's configuration, read from the environment once at start.
// Anything missing or malformed stops the start with a message naming the
// variable (design decision 4).

const optional = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const url = (protocols: string[]) =>
  z
    .string({ error: 'is required' })
    .trim()
    .min(1, 'is required')
    .refine((value) => URL.canParse(value) && protocols.includes(new URL(value).protocol), {
      message: `must be a ${protocols.join(' or ')} URL`,
    });

const optionalUrl = (protocols: string[]) =>
  optional.refine(
    (value) => value === undefined || (URL.canParse(value) && protocols.includes(new URL(value).protocol)),
    { message: `must be a ${protocols.join(' or ')} URL` },
  );

const integer = (fallback: number, min: number) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === '') return fallback;
      const number = Number(value);
      if (!Number.isInteger(number) || number < min) {
        ctx.addIssue({ code: 'custom', message: `must be a whole number of at least ${min}` });
        return z.NEVER;
      }
      return number;
    });

// The server key that seals each account's OpenRouter key
// (board-image-generation design decision 1): the base64 of exactly 32
// bytes, or nothing, which turns image generation off. The message never
// repeats the value.
const secretsKey = optional.transform((value, ctx) => {
  if (value === undefined) return null;
  const bytes = Buffer.from(value, 'base64');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || bytes.length !== 32 || bytes.toString('base64') !== value) {
    ctx.addIssue({ code: 'custom', message: 'must be the base64 of 32 bytes (openssl rand -base64 32)' });
    return z.NEVER;
  }
  return bytes;
});

export const OPENROUTER_DEFAULT_URL = 'https://openrouter.ai/api/v1';

const databaseSchema = z.object({
  DATABASE_URL: url(['postgres:', 'postgresql:']),
});

const schema = databaseSchema.extend({
  PUBLIC_URL: url(['http:', 'https:']),
  PORT: integer(3000, 1),
  SESSION_TTL_HOURS: integer(720, 1),
  TRUST_PROXY_HOPS: integer(0, 0),
  PROMPTBOOK_ADMIN_USERNAME: optional,
  PROMPTBOOK_ADMIN_PASSWORD: optional,
  WEB_DIST: optional,
  APP_VERSION: optional,
  OIDC_ISSUER: optionalUrl(['http:', 'https:']),
  OIDC_CLIENT_ID: optional,
  OIDC_CLIENT_SECRET: optional,
  OIDC_PROVIDER_NAME: optional,
  OIDC_REDIRECT_URI: optionalUrl(['http:', 'https:']),
  PROMPTBOOK_DATA_DIR: optional,
  PROMPTBOOK_FILES_QUOTA_GB: integer(20, 1),
  PROMPTBOOK_FILES_GRACE_DAYS: integer(30, 1),
  PROMPTBOOK_SECRETS_KEY: secretsKey,
  OPENROUTER_BASE_URL: optionalUrl(['http:', 'https:']),
  ATELIER_URL: optionalUrl(['http:', 'https:']),
});

// The three variables that turn single sign-on on.
const OIDC_REQUIRED = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'] as const;

export interface Config {
  databaseUrl: string;
  // The origin of PUBLIC_URL: what Origin headers are checked against.
  publicOrigin: string;
  port: number;
  sessionTtlHours: number;
  trustProxyHops: number;
  admin: { username: string; password: string } | null;
  // Single sign-on through an OpenID Connect provider (single-sign-on design
  // decision 2); null signs in with local passwords.
  oidc: OidcConfig | null;
  // Where the web build is; unset in development, where Vite serves it.
  webDist: string | null;
  // The release this server runs, reported by the health check; "dev" when
  // unset.
  appVersion: string;
  // The folder the file store keeps images and tracks in (asset-board design
  // decision 3): /data in the image, ./data in development.
  dataDir: string;
  // What each user may store, counted once per content; GiB.
  filesQuotaGb: number;
  // How long a project keeps a file its document no longer lists.
  filesGraceDays: number;
  // The key that seals each account's OpenRouter key; null: image
  // generation is not configured (board-image-generation design decision 1).
  secretsKey: Buffer | null;
  // OpenRouter's API, without a trailing slash; tests point it at a fake.
  openRouterBaseUrl: string;
  // The Atelier this server generates through, without a trailing slash;
  // null: Atelier is not available here (atelier-image-provider design
  // decision 2). Its API is under /api/v1.
  atelierUrl: string | null;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  // The provider's name on the sign-in button.
  providerName: string;
  redirectUri: string;
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

function parse<T extends z.ZodType>(zodSchema: T, env: Env): z.output<T> {
  const result = zodSchema.safeParse(env);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
  throw new ConfigError(`Invalid configuration:\n${lines.map((line) => `  ${line}`).join('\n')}`);
}

export function loadConfig(env: Env = process.env): Config {
  const values = parse(schema, env);
  const username = values.PROMPTBOOK_ADMIN_USERNAME;
  const password = values.PROMPTBOOK_ADMIN_PASSWORD;
  if ((username === undefined) !== (password === undefined)) {
    throw new ConfigError(
      'Invalid configuration:\n  PROMPTBOOK_ADMIN_USERNAME and PROMPTBOOK_ADMIN_PASSWORD must be set together',
    );
  }
  const publicOrigin = new URL(values.PUBLIC_URL).origin;
  const oidc = oidcConfig(values, publicOrigin);
  if (oidc && (username !== undefined || password !== undefined)) {
    throw new ConfigError(
      'Invalid configuration:\n  PROMPTBOOK_ADMIN_USERNAME and PROMPTBOOK_ADMIN_PASSWORD cannot be used with single sign-on',
    );
  }
  return {
    databaseUrl: values.DATABASE_URL,
    publicOrigin,
    port: values.PORT,
    sessionTtlHours: values.SESSION_TTL_HOURS,
    trustProxyHops: values.TRUST_PROXY_HOPS,
    admin: username !== undefined && password !== undefined ? { username, password } : null,
    oidc,
    webDist: values.WEB_DIST ?? null,
    appVersion: values.APP_VERSION ?? 'dev',
    dataDir: values.PROMPTBOOK_DATA_DIR ?? './data',
    filesQuotaGb: values.PROMPTBOOK_FILES_QUOTA_GB,
    filesGraceDays: values.PROMPTBOOK_FILES_GRACE_DAYS,
    secretsKey: values.PROMPTBOOK_SECRETS_KEY,
    openRouterBaseUrl: (values.OPENROUTER_BASE_URL ?? OPENROUTER_DEFAULT_URL).replace(/\/+$/, ''),
    atelierUrl: values.ATELIER_URL === undefined ? null : values.ATELIER_URL.replace(/\/+$/, ''),
  };
}

// All three of OIDC_REQUIRED or none: a deployment that sets only some of
// them means single sign-on and must not start with passwords instead.
function oidcConfig(values: z.output<typeof schema>, publicOrigin: string): OidcConfig | null {
  const missing = OIDC_REQUIRED.filter((name) => values[name] === undefined);
  if (missing.length === OIDC_REQUIRED.length) return null;
  if (missing.length > 0) {
    const set = OIDC_REQUIRED.filter((name) => !missing.includes(name));
    throw new ConfigError(`Invalid configuration:\n  ${missing.join(' and ')} must be set with ${set.join(' and ')}`);
  }
  // The callback route and the handshake cookie exist only there.
  const callback = `${publicOrigin}/api/auth/oidc/callback`;
  const redirectUri = values.OIDC_REDIRECT_URI ?? callback;
  if (new URL(redirectUri).href !== callback) {
    throw new ConfigError(`Invalid configuration:\n  OIDC_REDIRECT_URI must be ${callback}, PUBLIC_URL's origin`);
  }
  return {
    issuer: values.OIDC_ISSUER!,
    clientId: values.OIDC_CLIENT_ID!,
    clientSecret: values.OIDC_CLIENT_SECRET!,
    providerName: values.OIDC_PROVIDER_NAME ?? 'single sign-on',
    redirectUri,
  };
}

// What the command line needs: only the database.
export function loadDatabaseUrl(env: Env = process.env): string {
  return parse(databaseSchema, env).DATABASE_URL;
}
