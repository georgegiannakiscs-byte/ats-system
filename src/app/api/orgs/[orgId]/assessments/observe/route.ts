import { z } from "zod";
import { tenantTx } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { featureEnabled, requireOrg } from "@/server/org";
import { runObservations } from "@/server/assessments";

/** Re-runs optional AI observations on written answers (only when the company has the feature on). */
export const POST = handler(async (req, ctx: { params: Promise<{ orgId: string }> }) => {
  const access = await requireOrg((await ctx.params).orgId, "assessments.manage");
  const { attemptId } = z.object({ attemptId: z.string().uuid() }).parse(await req.json());
  if (!(await featureEnabled(access.org.id, "ai_assessment_observations"))) throw new HttpError(403, "AI response observations are switched off for this company", "feature_disabled");
  const [a] = await tenantTx(access.org.id, access.user.id, (q) => q<{ id: string; status: string }>("select id, status from assessment_attempts where id = $1", [attemptId]));
  if (!a || a.status !== "completed") throw new HttpError(404, "Completed Quick Check not found", "not_found");
  await tenantTx(access.org.id, access.user.id, (q) => q("delete from assessment_observations where attempt_id = $1", [a.id]));
  await runObservations(a.id);
  return json({ ok: true });
});
