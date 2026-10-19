import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from './accounts/auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { AppError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { settingsRoutes } from './routes/settings.js';
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
}

export async function buildApp({ config, db, logger = false }: AppOptions): Promise<FastifyInstance> {
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
  await app.register(authPlugin, { config, db });
  await app.register(healthRoutes, { db });
  await app.register(authRoutes, { config, db });
  await app.register(settingsRoutes, { db });
  await app.register(webPlugin, { config });
  return app;
}
