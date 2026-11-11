import { sys } from "@/server/db";
import { env } from "@/server/env";
import { handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";

/** Integration health. Credentials and tokens are never returned - only whether they are configured. */
export const GET = handler(async () => {
  await requirePlatformAdmin();
  const rows = await sys(`select i.provider, i.status, i.last_sync_at, i.failed_attempts, i.last_error, o.name as company, o.id as org_id
    from integrations i join organizations o on o.id = i.org_id order by o.name, i.provider`);
  const platform = [
    { provider: "Email (SMTP)", configured: Boolean(env.smtpUrl && env.mailFrom), action: "Set SMTP_URL and MAIL_FROM" },
    { provider: "Malware scanning (ClamAV)", configured: Boolean(env.clamavHost), action: "Set CLAMAV_HOST (and CLAMAV_PORT)" },
    { provider: "AI provider", configured: Boolean(process.env.AI_PROVIDER_API_KEY), action: "Set AI_PROVIDER_API_KEY (Phase 2)" },
    { provider: "LinkedIn API", configured: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET), action: "Requires LinkedIn developer app + partner approval (Phase 3)" },
    { provider: "Google Calendar / Meet", configured: Boolean(process.env.GOOGLE_CLIENT_ID), action: "Requires Google Cloud OAuth client (Phase 2)" },
    { provider: "Microsoft 365 / Teams", configured: Boolean(process.env.MICROSOFT_CLIENT_ID), action: "Requires Azure app registration (Phase 2)" },
  ];
  const email = await sys<{ status: string; n: string }>("select status, count(*) n from email_outbox group by status");
  return json({ companies: rows, platform, emailOutbox: Object.fromEntries(email.map((e) => [e.status, Number(e.n)])) });
});
