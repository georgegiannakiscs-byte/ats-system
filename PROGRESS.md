# Ulysse — development progress

Status legend: **✅ Implemented and tested** · **🟡 Implemented, not tested** · **🔶 Partially implemented** · **🔑 Requires credentials** · **🤝 Requires third-party approval** · **⚖️ Requires compliance review** · **⬜ Not started**

"Tested" means covered by `npm run test:acceptance` (Phase 1, 13 API/database tests), `npm run test:quick-check` (CV Builder & Quick Check, 8 API/database scenarios A–G) and/or the browser journeys `npm run test:e2e` and `npm run test:e2e:quick-check`, run against dev **and** the production build.

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
| CV parsing (EN/EL, OCR) | 🔶 | Text extraction from PDF/DOCX + deterministic contact details ✅; structuring into the CV Builder with Claude ✅ (stub-tested, see below). OCR for scanned PDFs ⬜. |
| AI-assisted CV analysis / candidate scoring | ⬜ ⚖️ | Deliberately not built: no fit scores, rankings or hire/reject recommendations. |

## CV Builder & AI-powered Quick Check

The application still requires **only full name, email and a CV**. A generated PDF satisfies the CV requirement; the Quick Check is always optional and never blocks or changes the application.

| Feature | Status | Notes |
|---|---|---|
| "Upload my CV" / "Create my CV" on the application form | ✅ | Name and email typed in the form are reused by the builder (journey test). No account needed. |
| CV Builder editor + live preview | ✅ | Editor left, live preview right; mobile: section steps + Preview toggle (journey test). Autosaves only on the candidate's device until they generate the PDF. |
| Sections | ✅ | Personal (name & email required), headline, summary, experience (multiple, drag to reorder, current role, description/responsibilities/achievements), education, skills (tag input + suggestions from the job), languages + level, certifications, projects, publications/awards/volunteering/links/other. |
| Optional photo | ✅ | JPG/PNG/WebP, crop, zoom, reposition (drag or arrow keys), replace, remove, circle/rectangle. Re-encoded on the server (metadata stripped). Stored separately, never sent to AI, never used in scoring. Companies can hide photos during screening (tested). Drag-repositioning itself is 🟡 (manually verified only). |
| Templates: Minimal (ATS-friendly), Modern, Professional | ✅ | Real text-based PDFs (pdfkit, embedded Liberation fonts covering Greek & Latin), selectable/extractable text (tested by re-extracting), page breaks, page numbers, multi-page. Platform and company can restrict templates (tested). |
| Generate / preview / download / edit / change template / "Use this CV" | ✅ | Generated PDF stored privately as a single-use draft (6 h); attached by token, replaceable before submit, can't be reused or moved to another company's job (tested). Recruiters see "Created with the CV Builder". |
| "Create a new CV from this file" | ✅ | Suggestions only, nothing stored; contact details found without AI; other sections via Claude when available (stub-tested), otherwise contact details only (tested). Scanned image PDFs: no OCR ⬜. |
| "Improve my summary" | ✅ | Claude suggests wording; candidate must choose "Use this". Suggestions containing numbers not in the candidate's input are discarded (tested). Real-API quality: 🔑 untested. |
| Expired builder drafts cleanup | ⬜ | Drafts expire after 6 h and can't be used, but files are not yet deleted by a background job. |
| Quick Check question bank | ✅ | Manual questions, drafts → approval, edit = new version back to draft, archive/restore, delete drafts only. Question text, type, options, key, explanation, competency, difficulty, recommended time, language, version, source, model, generation version stored. |
| AI question generation (Anthropic) | ✅ stub / 🔑 real | Official `@anthropic-ai/sdk`, server-side only, structured output with JSON schema + server-side Zod re-validation + deterministic quality checks (malformed/ambiguous questions rejected). Uses job data only — verified the prompt contains no candidate data. Saved as drafts needing approval (tested). **Real Claude calls are untested here: no API key in this environment.** |
| Job-level Quick Check settings | ✅ | Enable, 3–4 approved questions, timed (20–60 s) or untimed, language, instructions, complete-later email, extended/untimed accommodations, recruiter notification. |
| Candidate Quick Check | ✅ | Offered after a successful application; also by email link ("later") and recruiter invite/re-invite (old link revoked) (tested). Branded intro with position, count, duration, instructions, timing, privacy and accommodations; one question at a time; progress bar; countdown. Completion message: "Thank you! Your responses have been submitted successfully." |
| Server-side timing | ✅ | Deadline set when each question is served; reload doesn't reset it; late answers aren't recorded; timed-out questions recorded as unanswered (tested). |
| Connectivity handling | 🟡 | Retries with back-off and an offline notice; the timer keeps running on the server. Not covered by automated tests. |
| Accessibility accommodations | ✅ | Extended (2×) or untimed, chosen without justification; shown to reviewers as an accommodation, never penalised (tested). Keyboard-operable, labelled controls. No webcam, recording or proctoring. |
| Deterministic answer checking | ✅ | Multiple choice compared with the approved key on the server — never by an LLM (tested). Response speed not shown or scored. |
| AI observations on written answers | 🟡 ⚖️ | Implemented (descriptive concepts / points to clarify / follow-up questions; no scores) but **off by default** behind the `ai_assessment_observations` flag pending legal, fairness and human-oversight review. Not covered by automated tests. |
| Candidate-specific interview follow-up questions | 🔶 | Only as part of AI observations on written answers. CV-based follow-ups ⬜. |
| Workspace: Assessments section | ✅ | Question bank, AI drafting dialog, jobs overview, responses list, CSV export (formula-injection safe, tested). |
| Candidate profile "Quick Check" tab & pipeline status | ✅ | Not invited / Invited / Started / Pending human review / Completed (after reviewer notes) / Declined / Unavailable. Never advances or rejects (tested). Hiring managers can view, interviewers see status only. |
| Company settings: CV Builder & AI | ✅ | Templates, default template, hide photos; per-feature AI switches with live availability reasons. |
| Platform admin | ✅ / 🟡 | Per-company enable/disable of CV Builder, Quick Check and each AI feature (existing feature flags ✅). AI provider settings (on/off, model, monthly request and budget limits per company) and CV template availability ✅. AI usage page (requests, failures, tokens, cost per company, background observation jobs) 🟡 — aggregate only, no candidate data. |
| Usage, limits, cost tracking | ✅ | Every call logged in `ai_usage` (model, tokens, estimated cost, latency, errors, blocked). Monthly per-company request and budget limits enforced. Rate limits on public endpoints. Retries (2) and 90 s timeout in the SDK client. |
| Multi-company isolation | ✅ | All new tables have RLS + FORCE RLS; verified at API and database level (questions, attempts, responses, configs, builder profiles, photos, drafts, observations); `ai_usage` is not readable by tenants (tested). |
| Everything works without AI | ✅ | Tested with no API key: AI actions return a clear message; builder, manual questions, Quick Check and checking unaffected. |

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
| Anthropic Claude | `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`) | AI actions show "not configured"; everything else works. Real API calls not yet verified in this environment. |
| Google / Microsoft (Phase 2) | OAuth client IDs & secrets | Calendar/email integrations "Not configured". |
| LinkedIn (Phase 3) | `LINKEDIN_CLIENT_ID/SECRET` + partner approval | Only tracked links work. |
