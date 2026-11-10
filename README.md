# Déceler — multi-company Applicant Tracking System

Premium recruiting platform: one account manages many companies, each a fully isolated workspace with its own jobs, candidates, team, branding and public careers page. Candidates apply with just **name, email and CV**.

See **[PROGRESS.md](PROGRESS.md)** for the honest status of every feature.

## Quick start (local)

Requirements: Node 22+, PostgreSQL 14+.

```bash
createuser --createrole -P deceler        # a NON-superuser owner (superusers bypass Row Level Security)
createdb -O deceler deceler
cp .env.example .env.local                # set DATABASE_URL (APP_SECRET is auto-generated in dev)
npm install
npm run dev                               # migrations run automatically on start
```

Open http://localhost:3000, create an account. In development the **first account becomes Platform Super Admin** (`/admin`). In production use `PLATFORM_ADMIN_EMAILS`.

## Production

```bash
APP_SECRET=$(openssl rand -hex 32) docker compose up -d     # app + PostgreSQL + persistent storage
```

or build the standalone server yourself: `npm run build && npm start` (needs `DATABASE_URL`, `APP_SECRET`, `APP_URL`, `STORAGE_DIR`). Any Node host with PostgreSQL works (Render, Railway, Fly.io, a VPS, Kubernetes…); Supabase/Neon/RDS can provide the database. Static hosting (e.g. GitHub Pages) is **not** possible — Déceler has a server, a database and private file storage.

## Tests

```bash
npm run test:acceptance    # API + database-level scenarios (multi-company, admin, branding, 3-field application,
                           # optional data, LinkedIn tracking, pipeline to hire, tenant isolation, permissions)
npm run test:e2e           # browser journey (requires Playwright + Chromium)
```

Both run against a running server (`BASE_URL`, default `http://localhost:3000`). CI (`.github/workflows/ci.yml`) runs type-check, lint, migrations, production build and the acceptance suite against PostgreSQL.

## Architecture

```
db/migrations/           SQL schema + Row Level Security policies (applied automatically)
src/server/              Server-only code
  db.ts                  sys() system context · tenantTx() RLS-restricted tenant context
  auth.ts, security.ts   sessions, scrypt, signed tokens, rate limiting
  org.ts, permissions.ts per-company authorisation (by org ID), roles, audit log
  commands.ts            every workspace write, validated (zod) and permission-checked
  workspace.ts           per-company workspace snapshot
  storage.ts, cv.ts      private file storage, content sniffing, malware-scan hook
src/app/api/             Route handlers (auth, orgs, files, public apply, admin)
src/app/app/[company]/   Company workspace (dashboard, jobs, candidates, pipeline, …)
src/app/careers/         Public careers pages & application form (EN/EL)
src/app/admin/           Platform Super Admin
```

**Tenant isolation.** Every tenant table has `org_id`, RLS and `FORCE ROW LEVEL SECURITY`. Authenticated requests switch to the restricted role `deceler_app` and pin `app.org_id` / `app.user_id`; policies also require an active membership in an active company. A separate owner-only "system context" (explicit `app.bypass`) is used solely for public intake, platform aggregates and new-company defaults — the tenant role can never use it. Files are served only through short-lived HMAC-signed links that are re-authorised against membership on every request.

**Platform vs company administration.** Platform Super Admins manage companies, users, features and settings but have no access to company recruitment data. Company Admins manage only their own company.

## Rebranding

Product name: `src/config/brand.ts`. Logo: `src/assets/deceler-logo.png`. Colours: tokens in `src/app/globals.css`.
