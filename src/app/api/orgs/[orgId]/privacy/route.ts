import { sys, tenantTx } from "@/server/db";
import { handler, json } from "@/server/http";
import { requireOrg } from "@/server/org";
import { expiredCandidates, retentionFor } from "@/server/erasure";

/** Data & privacy settings, plus how many candidates the retention job will delete now and within 30 days. */
export const GET = handler(async (_req, ctx: { params: Promise<{ orgId: string }> }) => {
  const { orgId } = await ctx.params;
  const access = await requireOrg(orgId, "settings.manage");
  const [o] = await sys<{ privacy: Record<string, unknown> }>("select privacy from organizations where id = $1", [orgId]);
  const [p] = await sys<{ months: number | null }>("select (value->>'retentionMonths')::int as months from platform_settings where key = 'recruitment_defaults'");
  const policy = await retentionFor(orgId);
  const [due, soon] = await tenantTx(orgId, access.user.id, async (q) => [await expiredCandidates(q, orgId, policy.months), await expiredCandidates(q, orgId, policy.months, 30)]);
  return json({
    settings: { retentionMonths: (o?.privacy.retentionMonths as number | null) ?? null, policyUrl: (o?.privacy.policyUrl as string) ?? "", contactEmail: (o?.privacy.contactEmail as string) ?? "" },
    platformMonths: p?.months ?? 24, effectiveMonths: policy.months, dueNow: due.length, dueWithin30Days: soon.length,
  });
});
