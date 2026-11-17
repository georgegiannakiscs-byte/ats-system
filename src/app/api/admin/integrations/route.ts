import { sys } from "@/server/db";
import { env } from "@/server/env";
import { clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";

/** Integration health. Credentials and tokens are never returned - only whether they are configured. */
export const GET = handler(async (req) => {
  await requirePlatformAdmin();
  const rows = await sys(`select i.provider, i.status, i.last_sync_at, i.failed_attempts, i.last_error, o.name as company, o.id as org_id
    from integrations i join organizations o on o.id = i.org_id order by o.name, i.provider`);
  const platform = [
    { provider: "Email (SMTP)", configured: Boolean(env.smtpUrl && env.mailFrom), action: "Set SMTP_URL and MAIL_FROM" },
    { provider: "Malware scanning (ClamAV)", configured: Boolean(env.clamavHost), action: "Set CLAMAV_HOST (and CLAMAV_PORT)" },
    { provider: "AI (Anthropic Claude)", configured: Boolean(process.env.ANTHROPIC_API_KEY), action: "Set ANTHROPIC_API_KEY" },
    { provider: "LinkedIn API", configured: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET), action: "Requires LinkedIn developer app + partner approval (Phase 3)" },
    { provider: "Google Calendar / Meet", configured: Boolean(process.env.GOOGLE_CLIENT_ID), action: "Requires Google Cloud OAuth client (Phase 2)" },
    { provider: "Microsoft 365 / Teams", configured: Boolean(process.env.MICROSOFT_CLIENT_ID), action: "Requires Azure app registration (Phase 2)" },
  ];
  const email = await sys<{ status: string; n: string }>("select status, count(*) n from email_outbox group by status");
  // What the hosting's proxy sends for this request, to choose CLIENT_IP_HEADER / TRUSTED_PROXY_HOPS for rate limits.
  const h = (n: string) => req.headers.get(n);
  const ip = {
    used: clientIp(req), setting: env.clientIpHeader ? `CLIENT_IP_HEADER=${env.clientIpHeader}` : env.trustedProxyHops ? `TRUSTED_PROXY_HOPS=${env.trustedProxyHops}` : "default (left-most X-Forwarded-For)",
    headers: { "x-forwarded-for": h("x-forwarded-for"), "cf-connecting-ip": h("cf-connecting-ip"), "true-client-ip": h("true-client-ip"), "x-real-ip": h("x-real-ip") },
  };
  return json({ companies: rows, platform, emailOutbox: Object.fromEntries(email.map((e) => [e.status, Number(e.n)])), clientIp: ip });
});
