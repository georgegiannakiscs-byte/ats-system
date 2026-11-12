# Ulysse - multi-company Applicant Tracking System

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

## Try it in GitHub Codespaces

On GitHub: **Code → Codespaces → Create codespace** (on the branch you want to see). The first start installs, migrates and builds (a few minutes), then opens the app on port 3000 with demo data. Sign in with `demo@example.com` / `Ulysse-demo-2026` (platform admin + admin of "Aegean Analytics"). Details: [.devcontainer/README.md](.devcontainer/README.md). Seed the same demo data elsewhere with `node scripts/seed-demo.mjs` while the server runs.

## Free test deployment (Render + Neon)

1. Create a free PostgreSQL database on [Neon](https://neon.tech) (region: Frankfurt) and copy its connection string.
2. On [Render](https://render.com): **New → Blueprint**, pick this repository. Render reads `render.yaml` and asks for:
   - `DATABASE_URL`: the Neon connection string.
   - `PLATFORM_ADMIN_EMAILS`: your email.
3. Open the `https://….onrender.com` address and sign up with that email. You are now platform admin.

Free limits:
- The service sleeps after 15 minutes without visits, and the next visit takes about a minute.
- Neon free has 0.5 GB of storage.

Files are stored in the database (`STORAGE_DRIVER=db`), because free Render services have no disk. Every merge to `main` redeploys automatically.

## Production

```bash
APP_SECRET=$(openssl rand -hex 32) docker compose up -d     # app + PostgreSQL + persistent storage
```

or build the standalone server yourself: `npm run build && npm start` (needs `DATABASE_URL`, `APP_SECRET`, `APP_URL`, `STORAGE_DIR`). Any Node host with PostgreSQL works (Render, Railway, Fly.io, a VPS, Kubernetes…); Supabase/Neon/RDS can provide the database. Static hosting (e.g. GitHub Pages) is **not** possible - Ulysse has a server, a database and private file storage.

## Tests

```bash
npm run test:acceptance    # API + database-level scenarios (multi-company, admin, branding, 3-field application,
                           # optional data, LinkedIn tracking, pipeline to hire, tenant isolation, permissions)
npm run test:quick-check   # CV Builder & Quick Check scenarios A–G (API + database). Starts a local
                           # Anthropic stub on :4599 - run the server with ANTHROPIC_API_KEY=stub-key
                           # ANTHROPIC_BASE_URL=http://127.0.0.1:4599 to exercise the AI paths, or without
                           # a key to check the no-AI fallbacks.
npm run test:talent        # /talent landing page + Admin → Talent leads (API + database)
npm run test:e2e           # browser journey (requires Playwright + Chromium)
npm run test:e2e:quick-check  # browser journey: build a CV → apply → Quick Check → recruiter review
```

All run against a running server (`BASE_URL`, default `http://localhost:3000`). CI (`.github/workflows/ci.yml`) runs type-check, lint, migrations, production build and both API suites against PostgreSQL (AI via the local stub - no real Anthropic calls).

## AI (Anthropic Claude)

Set `ANTHROPIC_API_KEY` on the server (never in the browser). Optional: `ANTHROPIC_MODEL` (default: platform setting, else `claude-opus-5-5`) and `ANTHROPIC_EFFORT`. Platform admins can switch AI off, pick the model and set monthly per-company request/budget limits in **Admin → Platform settings**, and follow usage in **Admin → AI usage**. Each company can switch individual AI helpers off in **Settings → AI features**. AI drafts questions and helps candidates word their own summary; it never scores, ranks or rejects candidates, and multiple-choice answers are checked deterministically. Observations on written answers are off by default pending a compliance review.

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
  cv/pdf.ts, cv/text.ts  CV Builder PDF rendering (3 templates, Greek/Latin fonts), PDF/DOCX text extraction
  assessments.ts         Quick Check: invitations, server-side timing, deterministic checking
  ai/claude.ts, ai/tasks.ts  Anthropic SDK wrapper (limits, usage, structured outputs) and prompts
src/app/api/             Route handlers (auth, orgs, files, public apply, admin)
src/app/app/[company]/   Company workspace (dashboard, jobs, candidates, pipeline, …)
src/app/careers/         Public careers pages & application form with CV Builder (EN/EL)
src/app/assess/[token]   Candidate Quick Check (token link, no account)
src/app/admin/           Platform Super Admin
```

**Tenant isolation.** Every tenant table has `org_id`, RLS and `FORCE ROW LEVEL SECURITY`. Authenticated requests switch to the restricted role `deceler_app` and pin `app.org_id` / `app.user_id`; policies also require an active membership in an active company. A separate owner-only "system context" (explicit `app.bypass`) is used solely for public intake, platform aggregates and new-company defaults - the tenant role can never use it. Files are served only through short-lived HMAC-signed links that are re-authorised against membership on every request.

**Platform vs company administration.** Platform Super Admins manage companies, users, features and settings but have no access to company recruitment data. Company Admins manage only their own company.

## Rebranding

Product name: `src/config/brand.ts`. Logo: `src/assets/ulysse-logo.webp`. Colours: tokens in `src/app/globals.css`.
