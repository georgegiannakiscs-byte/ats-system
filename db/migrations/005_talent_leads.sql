-- Ulysse - Talent leads: job seekers who submit the public /talent form (e.g. from LinkedIn).
-- They apply to the platform owner, not to a company, so these rows belong to no tenant and are
-- only reachable in the owner-only system context (platform admin API). Tenants can never read them.

create table talent_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  current_company text not null default '',
  role text not null default '',
  phone text not null default '',
  linkedin_url text not null default '',
  language text not null default 'en' check (language in ('en','el')),
  consent_at timestamptz not null,
  source text not null default 'Direct',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  cv_key text not null unique,
  cv_file_name text not null,
  cv_mime text not null,
  cv_size int not null,
  cv_sha256 text not null,
  cv_scan_status text not null default 'not_scanned' check (cv_scan_status in ('not_scanned','clean','infected','error')),
  cv_source text not null default 'upload' check (cv_source in ('upload','builder')),
  status text not null default 'new' check (status in ('new','reviewed','contacted','archived')),
  admin_notes text not null default '',
  submission_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index talent_leads_created_idx on talent_leads(created_at desc);
create index talent_leads_email_idx on talent_leads(lower(email));

-- CV Builder PDFs generated on /talent before the form is submitted (single use, short-lived).
create table talent_cv_drafts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  template text not null check (template in ('minimal','modern','professional')),
  data jsonb not null,
  storage_key text not null,
  size_bytes int not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table talent_leads enable row level security;
alter table talent_leads force row level security;
create policy system_context on talent_leads to current_user using (current_setting('app.bypass', true) = 'on') with check (current_setting('app.bypass', true) = 'on');
alter table talent_cv_drafts enable row level security;
alter table talent_cv_drafts force row level security;
create policy system_context on talent_cv_drafts to current_user using (current_setting('app.bypass', true) = 'on') with check (current_setting('app.bypass', true) = 'on');

-- Platform-level emails (talent lead confirmations and notifications) belong to no company.
alter table email_outbox alter column org_id drop not null;
