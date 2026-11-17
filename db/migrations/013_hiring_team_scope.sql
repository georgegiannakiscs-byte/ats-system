-- Hiring team per job, and "Hiring Managers and Interviewers see only their jobs".
--
-- A job's hiring team is its hiring manager, its recruiter and the members listed in
-- jobs.hiring_team (interviewers are added automatically when an interview is scheduled).
-- When organizations.restrict_to_hiring_team is on (the default), members whose role in the
-- company is Hiring Manager or Interviewer see only the jobs whose hiring team they are on, and
-- only those jobs' candidates, applications, CVs, notes, interviews, Quick Checks and activity.
-- Admins and Recruiters always see everything.
--
-- Enforced in the database: RESTRICTIVE policies for the tenant role, on top of tenant isolation.
-- The system context (owner role, app.bypass) is unaffected.

alter table jobs add column if not exists hiring_team uuid[] not null default '{}';
alter table organizations add column if not exists restrict_to_hiring_team boolean not null default true;

-- true when the current member sees everything (Admin/Recruiter, or the company turned scoping off).
create or replace function app_sees_all_jobs() returns boolean
  language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.org_id = app_current_org() and m.user_id = app_current_user() and m.status = 'active'
      and m.role in ('hiring_manager', 'interviewer') and o.restrict_to_hiring_team
  ) $$;

-- Is the current member on this job's hiring team? (Callers combine it with app_sees_all_jobs.)
create or replace function app_on_job_team(j text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from jobs
    where id = j and org_id = app_current_org()
      and (hiring_manager_id = app_current_user() or recruiter_id = app_current_user() or app_current_user() = any(hiring_team))
  ) $$;

-- A candidate is visible when they applied to (or were added to) one of the member's jobs.
create or replace function app_on_candidate_team(c text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from applications a join jobs j on j.id = a.job_id
    where a.candidate_id = c and a.org_id = app_current_org()
      and (j.hiring_manager_id = app_current_user() or j.recruiter_id = app_current_user() or app_current_user() = any(j.hiring_team))
  ) $$;

create or replace function app_on_application_team(x text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from applications a join jobs j on j.id = a.job_id
    where a.id = x and a.org_id = app_current_org()
      and (j.hiring_manager_id = app_current_user() or j.recruiter_id = app_current_user() or app_current_user() = any(j.hiring_team))
  ) $$;

create or replace function app_on_attempt_team(x uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assessment_attempts t join jobs j on j.id = t.job_id
    where t.id = x and t.org_id = app_current_org()
      and (j.hiring_manager_id = app_current_user() or j.recruiter_id = app_current_user() or app_current_user() = any(j.hiring_team))
  ) $$;

grant execute on function app_sees_all_jobs(), app_on_job_team(text), app_on_candidate_team(text), app_on_application_team(text), app_on_attempt_team(uuid) to deceler_app;

-- (select app_sees_all_jobs()) is evaluated once per query, so Admins/Recruiters pay nothing per row.
do $$
declare
  r record;
  -- The owner role is a member of deceler_app (to SET ROLE), so these policies also reach it, including
  -- inside the SECURITY DEFINER helpers above: current_user tells them apart and stops any recursion.
  seeall constant text := '(current_user <> ''deceler_app'' or (select app_sees_all_jobs()))';
begin
  for r in select * from (values
    -- table, rule for reading/changing/deleting rows, rule for new rows (null = no extra rule)
    ('jobs',                    'app_on_job_team(id)',                         'app_on_job_team(id)'),
    ('applications',            'app_on_job_team(job_id)',                     'app_on_job_team(job_id)'),
    -- New candidates are allowed (they become visible once added to one of the member's jobs).
    ('candidates',              'app_on_candidate_team(id)',                   null),
    ('stage_history',           'app_on_application_team(application_id)',    'app_on_application_team(application_id)'),
    ('cv_documents',            'app_on_candidate_team(candidate_id)',         'app_on_candidate_team(candidate_id)'),
    ('notes',                   'app_on_candidate_team(candidate_id)',         'app_on_candidate_team(candidate_id)'),
    ('activities',              '(candidate_id is null or app_on_candidate_team(candidate_id)) and (job_id is null or app_on_job_team(job_id))', '(job_id is null or app_on_job_team(job_id))'),
    -- Interviews, scorecards and tasks name a candidate/job in their data; notifications belong to one person.
    ('workspace_records',       '(data->>''candidateId'' is null or app_on_candidate_team(data->>''candidateId'')) and (data->>''jobId'' is null or app_on_job_team(data->>''jobId'')) and (kind <> ''notification'' or data->>''userId'' = app_current_user()::text)',
                                '(data->>''candidateId'' is null or app_on_candidate_team(data->>''candidateId'')) and (data->>''jobId'' is null or app_on_job_team(data->>''jobId''))'),
    ('cv_drafts',               'app_on_job_team(job_id)',                     null),
    ('cv_builder_profiles',     'app_on_candidate_team(candidate_id)',         null),
    ('candidate_photos',        'app_on_candidate_team(candidate_id)',         null),
    ('job_assessments',         'app_on_job_team(job_id)',                     'app_on_job_team(job_id)'),
    ('assessment_attempts',     'app_on_job_team(job_id)',                     'app_on_job_team(job_id)'),
    ('assessment_responses',    'app_on_attempt_team(attempt_id)',             null),
    ('assessment_observations', 'app_on_attempt_team(attempt_id)',             null)
  ) as t(tbl, using_rule, check_rule) loop
    execute format('drop policy if exists team_scope_select on %I', r.tbl);
    execute format('drop policy if exists team_scope_update on %I', r.tbl);
    execute format('drop policy if exists team_scope_delete on %I', r.tbl);
    execute format('drop policy if exists team_scope_insert on %I', r.tbl);
    execute format('create policy team_scope_select on %I as restrictive for select to deceler_app using (%s or (%s))', r.tbl, seeall, r.using_rule);
    execute format('create policy team_scope_update on %I as restrictive for update to deceler_app using (%s or (%s))', r.tbl, seeall, r.using_rule);
    execute format('create policy team_scope_delete on %I as restrictive for delete to deceler_app using (%s or (%s))', r.tbl, seeall, r.using_rule);
    if r.check_rule is not null then
      execute format('create policy team_scope_insert on %I as restrictive for insert to deceler_app with check (%s or (%s))', r.tbl, seeall, r.check_rule);
    end if;
  end loop;
end $$;

create index if not exists applications_job_idx on applications(job_id);
create index if not exists applications_candidate_idx on applications(candidate_id);
