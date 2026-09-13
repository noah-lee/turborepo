# turborepo

Turborepo + pnpm + TypeScript boilerplate. Vite React SPA, Fastify API, PostgreSQL.

## Requirements

- Node 24 LTS (`.nvmrc` provided — `nvm use` / `fnm use` / etc.)
- pnpm 10+ (managed via corepack — run `corepack enable` once, then `pnpm install` activates the version pinned in `package.json`)
- A PostgreSQL connection string (`DATABASE_URL`) — Postgres is external to this repo. The companion [postgres](../postgres) repo provides a ready-made local + VPS setup with per-app database provisioning.

## Quickstart

Provision a database via the postgres companion repo:

```bash
cd ../postgres
cp .env.example .env       # set POSTGRES_PASSWORD
docker compose up -d
bash ./scripts/add-app.sh turborepo
```

Copy the printed `DATABASE_URL` into this repo's `.env`:

```bash
cd ../turborepo
cp .env.example .env       # paste DATABASE_URL
pnpm install
pnpm db:migrate
pnpm dev
```

Web runs at http://localhost:5173, API at http://localhost:3000. Vite proxies `/api/*` → API in dev.

### Required to boot

The API validates its env at startup and exits if anything is missing. A fresh clone needs, at minimum:

- `DATABASE_URL`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Token/cookie secrets: `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `COOKIE_SECRET` (generate with `openssl rand -base64 48`)
- `WEB_ORIGIN`
- Stripe billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID` — `.env.example` documents how to obtain each, including running `stripe listen` to forward webhooks in local dev.

Billing is included by default. A project that doesn't need it can delete `apps/api/src/billing`, the billing UI in `apps/web`, the `stripe_*` tables in `packages/db/src/schema.ts`, and the `STRIPE_*` env.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Run all apps in watch mode (Vite + `node --watch`) |
| `pnpm build` | Build every app for production |
| `pnpm typecheck` | Project-wide TypeScript check |
| `pnpm lint` | Biome check across the repo |
| `pnpm format` | Biome write-formatting |
| `pnpm db:generate` | Generate a new SQL migration from `packages/db/src/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `pnpm db:studio` | Open Drizzle Studio (DB browser) |

## Adding a database migration

1. Edit `packages/db/src/schema.ts`
2. `pnpm db:generate` — drizzle-kit writes a new SQL file under `packages/db/migrations/`
3. Review the SQL, commit it
4. `pnpm db:migrate` — applies pending migrations to `DATABASE_URL`

In production, run migrations as a one-shot job before rolling out a new api image (see VPS deployment below).

## Adding a shadcn/ui component

```bash
pnpm --filter @repo/web exec shadcn add <component>
```

## Adding a page

Routing is file-based ([TanStack Router](https://tanstack.com/router)). Drop a file under `apps/web/src/routes` and the route tree (`routeTree.gen.ts`, committed) regenerates on the next `pnpm dev`/`build`:

- `routes/about.tsx` → `/about` — public
- `routes/_app/settings.tsx` → `/settings` — inside the authenticated shell (navbar + auth guard in `routes/_app.tsx`)

Each file exports a `Route` via `createFileRoute`. Public pages sit at the top level; anything requiring a signed-in user goes under `_app/`. The landing page (`routes/index.tsx`) is public; `dashboard` and `profile` are protected examples.

## VPS deployment

The repo includes a `docker-compose.yml` that builds the api + web images and wires them to share Postgres from the [postgres](../postgres) companion repo.

**Network topology:**
- `shared-pg` — external network created by the postgres repo. The api joins to reach `postgres:5432`.
- `app` — internal bridge created by this compose. Both api and web join so web's nginx resolves `api:3000`.

```bash
# 1. Bring up Postgres on the VPS (if not already running)
cd postgres
cp .env.example .env       # set POSTGRES_PASSWORD
docker compose up -d
bash ./scripts/add-app.sh turborepo
# Note the printed DATABASE_URL_INTERNAL — it uses `postgres:5432` Docker DNS

# 2. Deploy the turborepo
cd ../turborepo
cp .env.example .env       # paste DATABASE_URL_INTERNAL as DATABASE_URL
                           # set CORS_ORIGIN + WEB_ORIGIN to your public domain,
                           # and the Google OAuth + token secrets + STRIPE_* vars
                           # (all required to boot).
docker compose build

# 3. Run migrations as a one-shot before bringing up the app
docker compose run --rm api node node_modules/@repo/db/src/migrate.ts

# 4. Start the app
docker compose up -d
```

Web is published on `:80` of the host by default (`WEB_PORT` to override). Put a reverse proxy + TLS terminator (Caddy, Traefik, nginx) in front for HTTPS.

**Multiple apps on the same VPS:** each app has its own `app` bridge network (auto-namespaced per compose project) and shares the `shared-pg` network. Apps don't see each other's services.

## Building Docker images standalone

For one-off builds (e.g. registry push), without compose:

```bash
docker build -f apps/api/Dockerfile -t app-api .
docker build -f apps/web/Dockerfile -t app-web .
```

Build context must be the repo root.

## Architecture

- `apps/api` — Fastify API (Node 24, native TS via type-stripping in dev, `tsc` build for prod)
- `apps/web` — Vite + React + Tailwind v4 + shadcn/ui + TanStack Router (file-based) + TanStack Query
- `packages/db` — Drizzle schema + client factory + migration runner
- `packages/shared` — Zod schemas shared between web and api
- `packages/tsconfig` — shared TypeScript presets (`base`, `react`)

## What's included

- **Auth** — Google OIDC + PKCE; access/refresh JWTs in HttpOnly cookies (`__Host-`/`__Secure-` prefixed in prod); global sign-out via a rotating `session_id`.
- **Billing** — Stripe subscriptions: checkout, customer portal, and webhook sync with atomic idempotency. Single premium tier out of the box.
- **Security** — `@fastify/helmet` + a coarse per-IP `@fastify/rate-limit` on the API (the Stripe webhook is exempt); security headers on the web shell (`nginx.conf`).

### Extending

- Add a route: create a plugin under `apps/api/src`, register it in `app.ts`.
- Add a shared type/contract: add a Zod schema in `packages/shared/src/schemas.ts` and consume it on both sides.
- Add email or file uploads: there's no seam for these yet — decorate a provider onto the app the way `billing/plugin.ts` decorates `stripe` (e.g. `app.decorate('email', ...)`), and wire in an SDK (Resend/Postmark/SES, or S3/R2) when you actually need one.

## Node 24 native TypeScript

The api runs `.ts` files directly via Node's type-stripping. This means avoiding TS features that can't be erased: enums, `namespace` blocks, parameter properties, legacy decorators. `erasableSyntaxOnly: true` is on in the shared `tsconfig` to catch any slip-ups.
