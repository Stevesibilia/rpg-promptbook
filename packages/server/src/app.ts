import cors, { type FastifyCorsOptions } from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { DiscoveryRequestOptions } from 'openid-client';
import { authPlugin, isPermissiveCorsPath } from './accounts/auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { AppError } from './errors.js';
import { openBlobStore, type BlobStore } from './files/blobs.js';
import { authRoutes } from './routes/auth.js';
import { filesRoutes } from './routes/files.js';
import { healthRoutes } from './routes/health.js';
import { mcpRoutes } from './routes/mcp.js';
import { oauthRoutes } from './routes/oauth.js';
import { oidcRoutes } from './routes/oidc.js';
import { projectsRoutes } from './routes/projects.js';
import { settingsRoutes } from './routes/settings.js';
import { snapshotsRoutes } from './routes/snapshots.js';
import { transferRoutes } from './routes/transfer.js';
import { syncPlugin } from './sync.js';
import { headersPlugin, webPlugin } from './web.js';

declare module 'fastify' {
  interface FastifyInstance {
    // Every route as `METHOD path`, for the test that checks each one is
    // protected or deliberately public.
    routeList: Set<string>;
  }
}

export interface AppOptions {
  config: Config;
  db: Db;
  logger?: boolean;
  // The file store; opened at config.dataDir when not given.
  blobs?: BlobStore;
  // Only for the tests' plain-http issuer; the server never sets it.
  oidcDiscoveryOptions?: DiscoveryRequestOptions;
}

export async function buildApp({ config, db, logger = false, blobs, oidcDiscoveryOptions }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    // Trust X-Forwarded-* from that many proxies in front, none by default.
    trustProxy: (_address: string, hop: number) => hop < config.trustProxyHops,
    bodyLimit: 1024 * 1024,
  });

  app.decorate('routeList', new Set<string>());
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) app.routeList.add(`${method} ${route.url}`);
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'bad_request', message: (error as Error).message });
    }
    req.log.error(error);
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong on the server.' });
  });

  await app.register(headersPlugin, { config });
  // Before the auth hook, so a preflight to the connector's routes is
  // answered before anything asks for a session. Any origin, no credentials,
  // on those routes only; no CORS headers anywhere else.
  const anonymous: FastifyCorsOptions = { origin: true, credentials: false, exposedHeaders: ['WWW-Authenticate'] };
  await app.register(cors, {
    delegator: (req: FastifyRequest, done: (error: Error | null, options?: FastifyCorsOptions) => void) =>
      done(null, isPermissiveCorsPath(req.url.split('?')[0]!) ? anonymous : { origin: false }),
  });
  await app.register(authPlugin, { config, db });
  await app.register(syncPlugin, { config, db });
  await app.register(healthRoutes, { db, config });
  await app.register(authRoutes, { config, db, sync: app.sync });
  if (config.oidc) {
    await app.register(oidcRoutes, { config, db, oidc: config.oidc, discoveryOptions: oidcDiscoveryOptions });
  }
  await app.register(settingsRoutes, { db });
  await app.register(projectsRoutes, { db, sync: app.sync });
  await app.register(transferRoutes, { db, sync: app.sync });
  await app.register(snapshotsRoutes, { db, sync: app.sync });
  await app.register(filesRoutes, { config, db, blobs: blobs ?? (await openBlobStore(config.dataDir)) });
  await app.register(oauthRoutes, { config, db, sync: app.sync });
  await app.register(mcpRoutes, { config, db, sync: app.sync });
  await app.register(webPlugin, { config });
  return app;
}
