-- Optional database-backed private file storage (STORAGE_DRIVER=db).
-- Used on hosts without a persistent disk (e.g. a free Render web service with a Neon database):
-- CVs, CV Builder PDFs, photos and logos are kept here instead of on the file system.
-- Only the system context (schema owner with app.bypass = on) can read or write it; the
-- tenant role deceler_app has no grant and no policy.
create table stored_objects (
  key text primary key,
  data bytea not null,
  size_bytes int not null,
  created_at timestamptz not null default now()
);
alter table stored_objects enable row level security;
alter table stored_objects force row level security;
create policy system_context on stored_objects to current_user using (current_setting('app.bypass', true) = 'on') with check (current_setting('app.bypass', true) = 'on');
