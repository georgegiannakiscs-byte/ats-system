-- Two-step verification (authenticator app, TOTP) for user accounts.
-- totp_secret: AES-256-GCM encrypted with a key derived from APP_SECRET (never stored in clear).
-- totp_pending_secret: a secret being set up, until the user confirms it with a first code.
-- totp_last_step: last accepted 30-second step, so a code can't be used twice.
-- totp_recovery_hashes: SHA-256 hashes of one-time recovery codes.
alter table users
  add column if not exists totp_secret text,
  add column if not exists totp_pending_secret text,
  add column if not exists totp_enabled_at timestamptz,
  add column if not exists totp_last_step bigint not null default 0,
  add column if not exists totp_recovery_hashes text[] not null default '{}';
