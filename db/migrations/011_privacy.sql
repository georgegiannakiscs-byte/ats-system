-- Data protection settings per company: how long candidate data is kept after their last
-- application closes (months; empty = platform default), a link to the company's privacy policy
-- and an email for data requests. Shown on the application form; used by the retention job.
alter table organizations add column if not exists privacy jsonb not null default '{}'::jsonb;
