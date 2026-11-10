-- Déceler — CV Builder & Quick Check (company-scoped, RLS protected)

-- ───────────── Company-level configuration ─────────────
alter table organizations add column if not exists cv_settings jsonb not null default '{}'::jsonb;
alter table organizations add column if not exists ai_settings jsonb not null default '{}'::jsonb;

-- ───────────── CV Builder ─────────────
-- A generated CV created on a public job page before the application is submitted.
-- Redeemed exactly once (consumed_at) by the application with the matching token.
create table cv_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  token_hash text not null unique,
  template text not null check (template in ('minimal','modern','professional')),
  data jsonb not null,
  storage_key text not null,
  photo_key text,
  size_bytes int not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index cv_drafts_org_idx on cv_drafts(org_id, created_at desc);

-- Structured CV data kept with the candidate (so a recruiter can see what was built).
create table cv_builder_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  candidate_id text not null references candidates(id) on delete cascade,
  application_id text references applications(id) on delete set null,
  cv_document_id uuid references cv_documents(id) on delete set null,
  template text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index cv_builder_profiles_candidate_idx on cv_builder_profiles(org_id, candidate_id);

-- Optional photographs. Stored separately so they can be hidden from screening
-- and are never sent to AI processing.
create table candidate_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  candidate_id text not null references candidates(id) on delete cascade,
  storage_key text not null unique,
  mime_type text not null,
  created_at timestamptz not null default now()
);

alter table cv_documents add column if not exists source text not null default 'upload' check (source in ('upload','builder','recruiter'));

-- ───────────── Quick Check: question bank ─────────────
create table assessment_questions (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  question_text text not null check (length(question_text) between 10 and 600),
  type text not null check (type in ('multiple_choice','short_text')),
  options jsonb not null default '[]'::jsonb,           -- [{id, text}]
  correct_option_id text,                                -- objective key (multiple choice only)
  explanation text not null default '',
  competency text not null default '',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  recommended_time_seconds int not null default 30 check (recommended_time_seconds between 20 and 120),
  language text not null default 'en' check (language in ('en','el')),
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  version int not null default 1,
  source text not null default 'manual' check (source in ('manual','ai')),
  ai_model text,
  generation_version text,
  job_id text references jobs(id) on delete set null,   -- job it was written for (optional)
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mc_has_key check (type <> 'multiple_choice' or (jsonb_array_length(options) between 2 and 6 and correct_option_id is not null))
);
create index assessment_questions_org_idx on assessment_questions(org_id, status);

-- Per-job Quick Check configuration. The 3-field application never depends on it.
create table job_assessments (
  job_id text primary key references jobs(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  enabled boolean not null default false,
  question_ids text[] not null default '{}',
  timed boolean not null default true,
  seconds_per_question int not null default 30 check (seconds_per_question between 20 and 60),
  language text not null default 'en' check (language in ('en','el')),
  instructions text not null default '',
  allow_later boolean not null default true,
  allow_extended_time boolean not null default true,
  allow_untimed boolean not null default true,
  notify_recruiter boolean not null default true,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ───────────── Quick Check: attempts & responses ─────────────
create table assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  application_id text not null references applications(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  candidate_id text not null references candidates(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'invited' check (status in ('invited','started','completed','declined','expired')),
  accommodation text not null default 'none' check (accommodation in ('none','extended','untimed')),
  questions jsonb not null,                -- immutable snapshot of the question set version presented
  set_version text not null,
  seconds_per_question int,                -- null = untimed
  language text not null default 'en',
  current_index int not null default 0,
  invited_by uuid references users(id) on delete set null,
  reviewer_notes text not null default '',
  ai_status text not null default 'not_requested' check (ai_status in ('not_requested','pending','done','failed','disabled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null
);
create index assessment_attempts_app_idx on assessment_attempts(org_id, application_id);

create table assessment_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  attempt_id uuid not null references assessment_attempts(id) on delete cascade,
  question_id text not null,
  question_version int not null,
  position int not null,
  served_at timestamptz not null default now(),
  deadline_at timestamptz,                  -- server-side timer (null when untimed)
  answered_at timestamptz,
  answer_option_id text,
  answer_text text,
  timed_out boolean not null default false,
  is_correct boolean,                       -- deterministic, objective questions only
  unique (attempt_id, position)
);

create table assessment_observations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  attempt_id uuid not null references assessment_attempts(id) on delete cascade,
  response_id uuid not null references assessment_responses(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- ───────────── AI usage & cost tracking ─────────────
create table ai_usage (
  id bigserial primary key,
  org_id uuid references organizations(id) on delete set null,
  feature text not null,
  model text not null,
  status text not null check (status in ('ok','error','blocked')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index ai_usage_org_idx on ai_usage(org_id, created_at desc);

-- ───────────── Row Level Security ─────────────
do $$
declare t text;
begin
  foreach t in array array['cv_drafts','cv_builder_profiles','candidate_photos','assessment_questions','job_assessments','assessment_attempts','assessment_responses','assessment_observations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (org_id = app_current_org() and app_is_member(org_id)) with check (org_id = app_current_org() and app_is_member(org_id))', t);
    execute format('create policy system_context on %I to %I using (current_setting(''app.bypass'', true) = ''on'') with check (current_setting(''app.bypass'', true) = ''on'')', t, current_user);
    execute format('grant select, insert, update, delete on %I to deceler_app', t);
  end loop;
end $$;
-- AI usage is written and aggregated in the system context only; tenants never read it directly.
alter table ai_usage enable row level security;
alter table ai_usage force row level security;
create policy system_context on ai_usage to current_user using (current_setting('app.bypass', true) = 'on') with check (current_setting('app.bypass', true) = 'on');

-- ───────────── Feature flags & platform settings ─────────────
insert into feature_flags (key, label, description, default_enabled, position) values
  ('cv_builder', 'CV Builder', 'Candidates can create a PDF CV on the job page instead of uploading one.', true, 10),
  ('quick_check', 'Quick Check', 'Short, role-related assessments offered after applying (3–4 questions).', true, 11),
  ('ai_question_generation', 'AI question generation', 'Draft Quick Check questions with Claude. Drafts always need recruiter approval.', true, 12),
  ('ai_assessment_observations', 'AI response observations', 'Claude summarises written Quick Check answers against job criteria. Requires a legal, fairness and human-oversight review before use in selection.', false, 13),
  ('ai_cv_assist', 'AI CV writing help', 'Candidates can ask Claude to improve the wording of their own summary.', true, 14)
on conflict (key) do nothing;

insert into platform_settings (key, value) values
  ('ai', '{"enabled": true, "model": "", "monthlyRequestLimitPerCompany": 500, "monthlyBudgetUsdPerCompany": 50}'),
  ('cv_templates', '{"enabled": ["minimal", "modern", "professional"]}')
on conflict (key) do nothing;
