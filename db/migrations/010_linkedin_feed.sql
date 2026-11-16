-- LinkedIn Basic Jobs XML feed.
-- organizations.linkedin_feed: per company opt-in {enabled, companyId, posterEmail, country}.
-- platform_settings 'linkedin_feed': the secret key in the feed URL (the feed contains poster
-- emails, so it is only served with this key; the URL is given to LinkedIn only).
alter table organizations add column if not exists linkedin_feed jsonb not null default '{}'::jsonb;
insert into platform_settings (key, value) values ('linkedin_feed', jsonb_build_object('key', encode(gen_random_bytes(24), 'hex')))
on conflict (key) do nothing;
