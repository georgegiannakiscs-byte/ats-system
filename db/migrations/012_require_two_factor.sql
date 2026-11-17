-- A company can require two-step verification for everyone in its workspace.
-- Members without it can still sign in, but can't open that company until they turn it on.
alter table organizations add column if not exists require_two_factor boolean not null default false;
