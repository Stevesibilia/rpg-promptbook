# syntax=docker/dockerfile:1

# The local stack's image (design decision 10): the server bundled with
# esbuild, the npm packages it needs at run time, the migrations and the web
# client's build, which the server serves from WEB_DIST. Targets linux/arm64
# and linux/amd64 on musl; @node-rs/argon2 ships a prebuilt binary for both.

# Every dependency, for the builds.
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/format/package.json packages/format/
COPY packages/project/package.json packages/project/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/format packages/format
COPY packages/project packages/project
COPY packages/server packages/server
COPY packages/web packages/web
RUN npm run build -w promptbook-server && npm run build -w promptbook-web

# The server's npm dependencies without the dev ones. The workspace packages
# are inlined in the bundle, but their npm dependencies (yjs, yaml, unified,
# remark, zod...) are installed here as the server's.
FROM node:26-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/format/package.json packages/format/
COPY packages/project/package.json packages/project/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev -w promptbook-server --no-audit --no-fund

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY packages/server/package.json packages/server/
COPY packages/server/migrations packages/server/migrations
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist /app/web
ENV WEB_DIST=/app/web
WORKDIR /app/packages/server
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/api/health"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
