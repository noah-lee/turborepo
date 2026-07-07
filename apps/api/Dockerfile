# syntax=docker/dockerfile:1
# Build from repo root: `docker build -f apps/api/Dockerfile -t app-api .`

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS builder
# Copy workspace manifests first so the dep layer caches when only source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @repo/api build
RUN pnpm deploy --filter=@repo/api --prod /out

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=builder --chown=node:node /out ./
USER node
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
