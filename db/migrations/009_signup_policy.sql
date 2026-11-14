-- Who can create an account: anyone ("open", the previous behaviour) or only people with a pending
-- invitation ("invite_only"). Emails in PLATFORM_ADMIN_EMAILS can always sign up.
insert into platform_settings (key, value) values ('signup', '{"policy": "open"}') on conflict (key) do nothing;
