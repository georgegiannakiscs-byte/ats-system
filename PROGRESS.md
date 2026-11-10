# Déceler — development progress

Status legend: **✅ Implemented and tested** · **🟡 Implemented, not tested** · **🔶 Partially implemented** · **🔑 Requires credentials** · **🤝 Requires third-party approval** · **⚖️ Requires compliance review** · **⬜ Not started**

"Tested" means covered by `npm run test:acceptance` (API + database level, 13 tests) and/or the browser journey `npm run test:e2e`, both run against dev **and** the production build.

## Phase 1 — Core platform & administration

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Authentication (email + password, sessions) | ✅ | scrypt hashing, httpOnly SameSite cookies, hashed session tokens, rate-limited login/sign-up, same-origin check on mutations. |
| 1a | Multi-factor authentication | ⬜ | Planned: TOTP + recovery codes. |
| 1b | Password recovery | 🔶 | Platform admin issues one-time 1-hour recovery links (tested). Self-service "forgot password" email needs SMTP 🔑. |
| 2 | Platform Super Admin panel (`/admin`) | ✅ | Overview metrics, companies, users, features, integration health, audit log, platform settings. Aggregates only — no candidate data (asserted in tests). |
| 2a | Time-limited, audited support access to company data | ⬜ | Deliberately not built yet: super admins have **no** access to company data today. |
| 3 | Company administration (per company) | ✅ | Profile, branding, careers page, team & roles, pipeline stages, templates, notifications, integrations status. |
| 4 | Multi-company architecture | ✅ | One account → many companies; stable org IDs for authorisation, slugs only for routing. |
| 4a | Row Level Security / tenant isolation | ✅ | Every tenant table: RLS + FORCE RLS; requests run as restricted role `deceler_app` pinned to org + user. Verified at database level (cross-tenant reads return 0 rows, writes rejected, bypass flag unusable by tenant role). |
| 5 | Company switcher | ✅ | Logos, search, recent, add company, join via invitation, all companies, platform admin link; remembers last company. |
| 6 | Independent company dashboards | ✅ | `/app/[slug]/dashboard`; workspace fully remounts on switch. |
| 7 | All My Companies overview (`/app`) | ✅ | Per-company counts computed under each company's own RLS context. |
| 8 | Company branding (colours, careers headline/intro/benefits, language, layout) | ✅ | |
| 9 | Company logo upload (light & dark variants) | ✅ | PNG/JPG/WebP (re-encoded, metadata stripped, resized), SVG with strict safety check; replace/remove; versioned URLs. Shown in switcher, workspace, careers pages, application form & confirmation. |
| 9a | Logo in branded emails / offer documents | 🔑 | Emails are plain text until an email provider is configured; offers are Phase 4. |
| 10 | Memberships, roles & permissions | ✅ | Admin / Recruiter / Hiring Manager / Interviewer per company, enforced server-side (tested: same user is admin in one company and interviewer in another). Invitations with single-use tokens. |
| 10a | Custom roles; "own jobs only" scoping for hiring managers | ⬜ | |
| 11 | Job management | 🔶 | Create, edit, drafts, duplicate, publish, pause, close, archive, reopen, assign HM/recruiter, all listed fields incl. contract type, preferred skills, experience, benefits, optional screening questions. **Not yet:** job templates, rich-text editor, approval workflow, scheduled publication. |
| 12 | Public careers pages | ✅ | `/careers/[slug]` and `/careers/[slug]/[job]`, EN/EL, search & filters, canonical URLs, Open Graph, `JobPosting` JSON-LD, `sitemap.xml`, `robots.txt`. Custom domains ⬜ (Phase 4). |
| 13–15 | Minimal application (3 required fields) + optional details | ✅ | Name, email, CV only. Optional section collapsed; optional fields validated only when filled; screening questions can't be made required. Mobile-first, upload progress, double-submit protection (idempotency key), honeypot, rate limit. |
| 13a | Confirmation email & recruiter notification | 🔶 | Recruiter gets an in-app notification ✅. Candidate confirmation is written to the email outbox; actually delivered only with SMTP configured 🔑. |
| 16–17 | CV upload & secure storage | ✅ | PDF/DOCX validated by content (not extension), private storage outside the web root, short-lived HMAC-signed URLs re-checked against membership, audit of views/downloads. |
| 16a | Malware scanning | 🔑 | ClamAV integration implemented 🟡; needs `CLAMAV_HOST`. Without it files are clearly labelled "not scanned". |
| 16b | Object storage (S3 / Supabase Storage) | 🔶 | Local-disk driver behind a 3-function interface; cloud driver needs credentials 🔑. |
| 18 | Candidate database | ✅ | Master profiles separate from applications; per-company dedupe by email; duplicate warning on manual add. |
| 19 | Candidate profile editing | ✅ | Inline editing incl. optional fields; candidate- vs recruiter-provided fields tracked and shown; changes logged on the activity timeline. |
| 20 | Recruitment pipeline | ✅ | Kanban (drag & drop, keyboard) + table, bulk moves, stage history, recruiter assignment, rejection reasons, **withdrawal as a distinct outcome**, custom stage names & targets. |
| 20a | Adding/removing pipeline stages per company | ⬜ | Eight core stages fixed (names editable). |

## Phase 2 — Intelligent recruitment

| Feature | Status | Notes |
|---|---|---|
| Interviews (schedule, list, calendar, cancel) | 🔶 | Persisted per company (tested in pipeline scenario). Stored as company-scoped records; to be normalised into tables. Time-zone handling & candidate self-scheduling ⬜. |
| Scorecards / evaluations | 🔶 | Submission persisted and updates evaluation status (tested). Configurable criteria ⬜. |
| Tasks & reminders | 🔶 | CRUD persisted per company 🟡. Automated reminders ⬜. |
| Email communication | 🔑 | Templates (persisted) and drafts logged; sending needs SMTP / Google / Microsoft. |
| Calendar integrations (Google, Outlook, Meet, Teams, Zoom) | 🔑 | OAuth apps required; UI shows "Not configured" honestly. |
| CV parsing (EN/EL, OCR) | ⬜ | |
| AI-assisted CV analysis | ⬜ ⚖️ | Requires AI provider 🔑 and an EU AI Act / GDPR review (recruitment is a high-risk use case). Feature flag exists, off by default. |

## Phase 3 — Integrations & growth

| Feature | Status | Notes |
|---|---|---|
| LinkedIn tracked application links | ✅ | `utm_source=linkedin` → source "LinkedIn" + UTM stored (tested). |
| "Share on LinkedIn" composer | ⬜ | |
| LinkedIn Company Page / Job Posting / RSC APIs | 🤝 🔑 | Partner approval + developer app required; shown as locked in the UI. |
| Talent pool & lists | 🔶 | Persisted per company 🟡; AI rediscovery ⬜. |
| Analytics | 🔶 | Computed from live company data (funnel, sources, time to hire from real hires, stage health, job performance). CSV export of candidates ✅ in UI 🟡. Rejection-reason, recruiter-workload reports ⬜. |
| Automations, candidate portal, other job boards | ⬜ | |

## Phase 4 — Premium

AI Copilot, workflow builder, offer management, e-signatures, careers page builder, custom domains, migration tools (CSV/Workable import): **⬜ Not started.**

## Cross-cutting

| Area | Status | Notes |
|---|---|---|
| Security headers (HSTS, nosniff, frame-ancestors, referrer, permissions) | ✅ | |
| Audit logging | ✅ | Company creation/suspension, invitations, role changes, logo & branding, CV access, platform settings, features, recovery links. |
| Data export / deletion / retention workflows | ⬜ ⚖️ | Retention default is configurable at platform level; enforcement job not built. |
| i18n | 🔶 | Careers pages, application form and confirmation emails in EN/EL. Workspace UI is English. |
| Public API & webhooks | ⬜ | |
| Background job queue | ⬜ | Emails send inline today; move to a queue before scale. |
| Rate limiting | 🔶 | In-memory per instance. Use Redis for multi-instance deployments. |

## Services requiring credentials

| Service | Variables | Without it |
|---|---|---|
| PostgreSQL | `DATABASE_URL` | Server refuses to start in production. |
| Signing secret | `APP_SECRET` | Server refuses to start in production. |
| Email (SMTP) | `SMTP_URL`, `MAIL_FROM` | Emails recorded as "not configured"; invitation/recovery links shown to share manually. |
| Malware scanning | `CLAMAV_HOST`, `CLAMAV_PORT` | CVs stored and labelled "not scanned". |
| AI provider (Phase 2) | `AI_PROVIDER_API_KEY` | AI features stay disabled. |
| Google / Microsoft (Phase 2) | OAuth client IDs & secrets | Calendar/email integrations "Not configured". |
| LinkedIn (Phase 3) | `LINKEDIN_CLIENT_ID/SECRET` + partner approval | Only tracked links work. |
