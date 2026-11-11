import { sys } from "@/server/db";
import { env } from "@/server/env";
import { handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";

/** Platform-wide aggregates only. No candidate-level personal data is returned. */
export const GET = handler(async () => {
  await requirePlatformAdmin();
  const [c] = await sys<Record<string, string>>(`select
    (select count(*) from organizations) companies,
    (select count(*) from talent_leads) talent_leads,
    (select count(*) from talent_leads where status = 'new') talent_leads_new,
    (select count(*) from organizations where status = 'active') active_companies,
    (select count(*) from users) users,
    (select count(*) from users where last_login_at > now() - interval '30 days' and status = 'active') active_users,
    (select count(*) from jobs) jobs,
    (select count(*) from jobs where status = 'published') published_jobs,
    (select count(*) from applications) applications,
    (select count(*) from applications where applied_at > now() - interval '7 days') applications_7d,
    (select coalesce(sum(size_bytes), 0) from cv_documents) cv_bytes,
    (select count(*) from cv_documents) cv_files,
    (select count(*) from email_outbox where status = 'failed') email_failed,
    (select count(*) from email_outbox where status = 'not_configured') email_unconfigured,
    (select count(*) from integrations where status = 'error') integration_errors`);
  const growth = await sys<{ month: string; companies: string }>(`select to_char(date_trunc('month', created_at), 'Mon YY') as month, count(*) companies, min(created_at) as m
    from organizations where created_at > now() - interval '12 months' group by 1 order by min(created_at)`);
  const activity = await sys<{ day: string; n: string }>(`select to_char(date_trunc('day', created_at), 'DD Mon') as day, count(*) n, min(created_at) m from activities where created_at > now() - interval '14 days' group by 1 order by min(created_at)`);
  const recentAudit = await sys(`select a.action, a.created_at, a.scope, u.email as actor, o.name as company from audit_logs a left join users u on u.id = a.actor_id left join organizations o on o.id = a.org_id order by a.id desc limit 8`);
  return json({
    metrics: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)])),
    growth: growth.map((g) => ({ month: g.month, companies: Number(g.companies) })),
    activity: activity.map((a) => ({ day: a.day, events: Number(a.n) })),
    recentAudit,
    services: {
      database: "connected",
      email: env.smtpUrl && env.mailFrom ? "configured" : "not_configured",
      malwareScanning: env.clamavHost ? "configured" : "not_configured",
      aiProvider: process.env.AI_PROVIDER_API_KEY ? "configured" : "not_configured",
      objectStorage: "local_disk",
    },
    ai: { requests: 0, note: "No AI provider configured - AI features are disabled." },
  });
});
