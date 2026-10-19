# syntax=docker/dockerfile:1

# The local stack's image (design decision 10): the server bundled with
# esbuild, the npm packages it needs at run time, the migrations and the web
# client's build, which the server serves from WEB_DIST. Targets linux/arm64
# and linux/amd64 on glibc; @node-rs/argon2 ships a prebuilt binary for both.
# The base images are Project Hummingbird's (registry.access.redhat.com/hi):
# the builder variant for the build stages, the minimal runtime for the last.
# They run as user 65532, so the build stages' COPY sets that owner.

# Every dependency, for the builds.
FROM registry.access.redhat.com/hi/nodejs:26-builder AS deps
WORKDIR /app
COPY --chown=65532:0 package.json package-lock.json ./
COPY --chown=65532:0 packages/format/package.json packages/format/
COPY --chown=65532:0 packages/project/package.json packages/project/
COPY --chown=65532:0 packages/server/package.json packages/server/
COPY --chown=65532:0 packages/web/package.json packages/web/
RUN --mount=type=cache,target=/tmp/.npm,uid=65532 npm ci --no-audit --no-fund

FROM deps AS build
COPY --chown=65532:0 tsconfig.base.json ./
COPY --chown=65532:0 packages/format packages/format
COPY --chown=65532:0 packages/project packages/project
COPY --chown=65532:0 packages/server packages/server
COPY --chown=65532:0 packages/web packages/web
RUN npm run build -w promptbook-server && npm run build -w promptbook-web

# The server's npm dependencies without the dev ones. The workspace packages
# are inlined in the bundle, but their npm dependencies (yjs, yaml, unified,
# remark, zod...) are installed here as the server's.
FROM registry.access.redhat.com/hi/nodejs:26-builder AS prod-deps
WORKDIR /app
COPY --chown=65532:0 package.json package-lock.json ./
COPY --chown=65532:0 packages/format/package.json packages/format/
COPY --chown=65532:0 packages/project/package.json packages/project/
COPY --chown=65532:0 packages/server/package.json packages/server/
COPY --chown=65532:0 packages/web/package.json packages/web/
RUN --mount=type=cache,target=/tmp/.npm,uid=65532 npm ci --omit=dev -w promptbook-server --no-audit --no-fund

FROM registry.access.redhat.com/hi/nodejs:26 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY packages/server/package.json packages/server/
COPY packages/server/migrations packages/server/migrations
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist /app/web
ENV WEB_DIST=/app/web
WORKDIR /app/packages/server
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
