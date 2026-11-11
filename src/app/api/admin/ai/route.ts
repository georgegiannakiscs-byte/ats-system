import { sys } from "@/server/db";
import { handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { aiConfigured, aiModel } from "@/server/ai/claude";

/** Platform AI monitoring: aggregate counts, cost and error messages only - no prompts, answers or candidate data. */
export const GET = handler(async () => {
  await requirePlatformAdmin();
  const [s] = await sys<{ value: { enabled: boolean; monthlyRequestLimitPerCompany: number; monthlyBudgetUsdPerCompany: number } }>("select value from platform_settings where key = 'ai'");
  const companies = await sys(
    `select o.id, o.name, count(*) filter (where u.status = 'ok')::int requests, count(*) filter (where u.status = 'error')::int errors, count(*) filter (where u.status = 'blocked')::int blocked,
       coalesce(sum(u.input_tokens), 0)::int input_tokens, coalesce(sum(u.output_tokens), 0)::int output_tokens, coalesce(sum(u.cost_usd), 0)::float cost_usd
     from ai_usage u join organizations o on o.id = u.org_id where u.created_at >= date_trunc('month', now()) group by o.id, o.name order by cost_usd desc`);
  const byFeature = await sys("select feature, count(*) filter (where status = 'ok')::int requests, coalesce(sum(cost_usd), 0)::float cost_usd from ai_usage where created_at >= date_trunc('month', now()) group by feature order by feature");
  const failures = await sys("select u.created_at, o.name as company, u.feature, u.model, u.status, u.error from ai_usage u left join organizations o on o.id = u.org_id where u.status <> 'ok' order by u.created_at desc limit 50");
  const [jobs] = await sys<{ pending: number; failed: number }>("select count(*) filter (where ai_status = 'pending')::int pending, count(*) filter (where ai_status = 'failed')::int failed from assessment_attempts");
  return json({ configured: aiConfigured(), model: await aiModel(), settings: s?.value ?? { enabled: true, monthlyRequestLimitPerCompany: 500, monthlyBudgetUsdPerCompany: 50 }, companies, byFeature, failures, jobs });
});
