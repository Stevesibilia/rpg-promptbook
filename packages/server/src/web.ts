import { isAbsolute, relative, resolve, sep } from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { isApiUrl } from './accounts/auth.js';
import type { Config } from './config.js';

// Security headers on every answer. Registered first, so every route gets them.
async function headers(app: FastifyInstance, { config }: { config: Config }) {
  const https = config.publicOrigin.startsWith('https:');
  const syncOrigin = config.publicOrigin.replace(/^http/, 'ws');
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // 'self' covers same-origin WebSockets in current browsers; the
        // explicit ws: or wss: origin covers the ones that predate CSP 3.
        connectSrc: ["'self'", syncOrigin],
        // The PDF engine is WebAssembly, which the browser compiles only with
        // 'wasm-unsafe-eval'; it allows no JavaScript eval.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        upgradeInsecureRequests: https ? [] : null,
      },
    },
    // Over plain HTTP (the local stack) the header would be ignored anyway.
    hsts: https,
  });
}

// Hashed names under /assets never change, so browsers keep them for a year;
// everything else, index.html first, is checked again on every use.
const cacheControl = (file: string) =>
  file.startsWith(`assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';

// The web build, with a fallback to its index.html for the app's own routes,
// and JSON 404s under /api. Registered last. The build carries Brotli and
// gzip copies of its larger files, sent to browsers that accept them.
async function web(app: FastifyInstance, { config }: { config: Config }) {
  if (config.webDist) {
    const root = isAbsolute(config.webDist) ? config.webDist : resolve(config.webDist);
    await app.register(fastifyStatic, {
      root,
      prefix: '/',
      preCompressed: true,
      setHeaders: (reply, path) => reply.header('cache-control', cacheControl(relative(root, path))),
    });
  }

  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const page = (req.method === 'GET' || req.method === 'HEAD') && !isApiUrl(req.url);
    if (page && config.webDist) return reply.type('text/html').sendFile('index.html');
    return reply.code(404).send({ error: 'not_found', message: 'Not found.' });
  });
}

export const headersPlugin = fp(headers, { name: 'headers' });
export const webPlugin = fp(web, { name: 'web' });
