-- Déceler — core multi-tenant schema (Phase 1)
-- Tenant tables carry org_id and are protected by Row Level Security.
-- The application connects as the schema owner and switches to the
-- restricted role `deceler_app` (SET LOCAL ROLE) for every tenant request.

create extension if not exists pgcrypto;

do $$ begin
  create role deceler_app nologin;
exception when duplicate_object then null; end $$;
grant deceler_app to current_user;

-- ───────────── Identity ─────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text not null,
  is_platform_admin boolean not null default false,
  status text not null default 'active' check (status in ('active','deactivated')),
  preferred_language text not null default 'en' check (preferred_language in ('en','el')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index users_email_key on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip text,
  user_agent text
);
create index sessions_user_idx on sessions(user_id);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- ───────────── Organizations ─────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'),
  name text not null,
  status text not null default 'active' check (status in ('active','suspended')),
  suspended_reason text,
  suspended_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  profile jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  onboarding jsonb not null default '{}'::jsonb,
  notification_prefs jsonb not null default '{}'::jsonb
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('admin','recruiter','hiring_manager','interviewer')),
  status text not null default 'active' check (status in ('active','removed')),
  title text,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','recruiter','hiring_manager','interviewer')),
  token_hash text not null unique,
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references users(id),
  revoked_at timestamptz
);
create index invitations_org_idx on invitations(org_id);

-- ───────────── Platform administration ─────────────
create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table feature_flags (
  key text primary key,
  label text not null,
  description text not null,
  default_enabled boolean not null default false,
  position int not null default 0
);

create table org_features (
  org_id uuid not null references organizations(id) on delete cascade,
  feature_key text not null references feature_flags(key) on delete cascade,
  enabled boolean not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  primary key (org_id, feature_key)
);

create table audit_logs (
  id bigserial primary key,
  org_id uuid references organizations(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  scope text not null check (scope in ('platform','org')),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs(created_at desc);
create index audit_logs_org_idx on audit_logs(org_id, created_at desc);

create table integrations (
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  status text not null default 'not_configured' check (status in ('not_configured','connected','error','pending_approval')),
  last_sync_at timestamptz,
  failed_attempts int not null default 0,
  last_error text,
  -- credentials are never stored here in plain text
  updated_at timestamptz not null default now(),
  primary key (org_id, provider)
);

-- ───────────── Recruitment (tenant data) ─────────────
create table pipeline_stages (
  org_id uuid not null references organizations(id) on delete cascade,
  stage_key text not null,
  label text not null,
  description text not null default '',
  sla_days int not null default 0,
  position int not null,
  primary key (org_id, stage_key)
);

create table jobs (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  slug text not null,
  title text not null,
  department text not null default '',
  location text not null default '',
  workplace text not null default 'Hybrid',
  employment_type text not null default 'Full-time',
  contract_type text not null default '',
  seniority text not null default 'Mid-level',
  status text not null default 'draft' check (status in ('draft','published','on_hold','closed','archived')),
  hiring_manager_id uuid references users(id) on delete set null,
  recruiter_id uuid references users(id) on delete set null,
  openings int not null default 1,
  salary_min int,
  salary_max int,
  currency text not null default 'EUR',
  summary text not null default '',
  responsibilities text not null default '',
  requirements text not null default '',
  required_experience text not null default '',
  benefits text not null default '',
  skills text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  screening_questions jsonb not null default '[]'::jsonb,
  channels jsonb not null default '{"careersPage": true, "linkedin": false, "indeed": false}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  target_hire_date timestamptz,
  unique (org_id, slug)
);
create index jobs_org_idx on jobs(org_id);

create table candidates (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  phone text not null default '',
  location text not null default '',
  headline text not null default '',
  current_company text not null default '',
  linkedin_url text,
  portfolio_url text,
  github_url text,
  source text not null default 'Careers page',
  tags text[] not null default '{}',
  skills text[] not null default '{}',
  languages text[] not null default '{}',
  experience jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  summary text not null default '',
  extra jsonb not null default '{}'::jsonb,          -- optional application fields
  field_sources jsonb not null default '{}'::jsonb,  -- field -> 'candidate' | 'recruiter'
  hue int not null default 200,
  in_talent_pool boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidates_org_idx on candidates(org_id);
create unique index candidates_org_email_key on candidates(org_id, lower(email));

create table applications (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  candidate_id text not null references candidates(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  stage text not null default 'applied',
  status text not null default 'active' check (status in ('active','rejected','hired','withdrawn')),
  applied_at timestamptz not null default now(),
  stage_entered_at timestamptz not null default now(),
  recruiter_id uuid references users(id) on delete set null,
  evaluation text not null default 'none',
  sort_order int not null default 0,
  rejection_reason text,
  withdrawal_reason text,
  source text not null default 'Careers page',
  utm jsonb not null default '{}'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  submission_key text
);
create index applications_org_idx on applications(org_id);
create unique index applications_submission_key on applications(org_id, submission_key) where submission_key is not null;

create table stage_history (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  application_id text not null references applications(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  from_status text,
  to_status text not null,
  changed_by uuid references users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table cv_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  candidate_id text not null references candidates(id) on delete cascade,
  application_id text references applications(id) on delete set null,
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null,
  sha256 text not null,
  scan_status text not null default 'not_scanned' check (scan_status in ('not_scanned','clean','infected','error')),
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index cv_documents_candidate_idx on cv_documents(org_id, candidate_id);

create table notes (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  candidate_id text not null references candidates(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table activities (
  id text primary key default ('act_' || replace(gen_random_uuid()::text, '-', '')),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null,
  actor_id uuid references users(id) on delete set null,
  candidate_id text,
  job_id text,
  message text not null,
  created_at timestamptz not null default now()
);
create index activities_org_idx on activities(org_id, created_at desc);

-- Phase 2 entities persisted as documents until normalised:
-- interviews, scorecards, tasks, talent lists, saved views, email templates, notifications.
create table workspace_records (
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, kind, id)
);

create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  kind text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','not_configured')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ───────────── Row Level Security ─────────────
create or replace function app_current_org() returns uuid
  language sql stable as $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;
create or replace function app_current_user() returns uuid
  language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- SECURITY DEFINER so the membership lookup is not itself filtered.
create or replace function app_is_member(o uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations g on g.id = m.org_id
    where m.org_id = o and m.user_id = app_current_user()
      and m.status = 'active' and g.status = 'active'
  ) $$;

grant usage on schema public to deceler_app;
grant execute on function app_current_org(), app_current_user(), app_is_member(uuid) to deceler_app;

do $$
declare t text;
begin
  foreach t in array array['pipeline_stages','jobs','candidates','applications','stage_history','cv_documents','notes','activities','workspace_records','email_outbox'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (org_id = app_current_org() and app_is_member(org_id)) with check (org_id = app_current_org() and app_is_member(org_id))', t);
    execute format('grant select, insert, update, delete on %I to deceler_app', t);
  end loop;
end $$;
grant usage, select on sequence stage_history_id_seq to deceler_app;

-- ───────────── Defaults ─────────────
insert into feature_flags (key, label, description, default_enabled, position) values
  ('talent_pool', 'Talent Pool', 'Company-specific talent pool and saved lists.', true, 1),
  ('advanced_analytics', 'Advanced Analytics', 'Funnel, source and time-to-hire reporting.', true, 2),
  ('ai_cv_analysis', 'AI CV Analysis', 'Evidence-based comparison of CVs against job criteria. Requires an AI provider.', false, 3),
  ('ai_copilot', 'AI Copilot', 'Assistant for summaries and drafting. Requires an AI provider.', false, 4),
  ('linkedin', 'LinkedIn integrations', 'LinkedIn sharing and official API integrations.', true, 5),
  ('candidate_portal', 'Candidate Portal', 'Secure self-service links for candidates.', false, 6),
  ('automations', 'Automations', 'WHEN → IF → THEN workflow rules.', false, 7),
  ('custom_branding', 'Custom Branding', 'Company logo, colours and careers page styling.', true, 8),
  ('custom_domains', 'Custom Domains', 'Serve the careers page on a company domain.', false, 9);

insert into platform_settings (key, value) values
  ('general', '{"platformName": "Déceler", "supportEmail": "", "defaultLanguage": "en", "supportedLanguages": ["en", "el"]}'),
  ('company_creation', '{"policy": "any_user"}'),
  ('storage', '{"maxCvMb": 10, "maxLogoMb": 2, "perCompanyQuotaMb": 5000}'),
  ('maintenance', '{"enabled": false, "message": ""}'),
  ('recruitment_defaults', '{"retentionMonths": 24, "careersLanguage": "en"}');
