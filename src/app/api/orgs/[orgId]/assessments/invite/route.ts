import { z } from "zod";
import { tenantTx } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { audit, featureEnabled, requireOrg } from "@/server/org";
import { assessUrl, createAttempt, emailInvite } from "@/server/assessments";

const Body = z.object({ applicationId: z.string().regex(/^[a-z]+_[A-Za-z0-9]{3,48}$/), sendEmail: z.boolean().default(true) });

/** Invites (or re-invites) a candidate to the job's Quick Check. Returns the secure link once. */
export const POST = handler(async (req, ctx: { params: Promise<{ orgId: string }> }) => {
  const access = await requireOrg((await ctx.params).orgId, "assessments.manage");
  const orgId = access.org.id;
  if (!(await featureEnabled(orgId, "quick_check"))) throw new HttpError(403, "Quick Check isn't enabled for this company", "feature_disabled");
  const v = Body.parse(await req.json());
  const r = await tenantTx(orgId, access.user.id, async (q) => {
    const [app] = await q<{ id: string; job_id: string; candidate_id: string; status: string; email: string; first_name: string; title: string }>(
      "select a.id, a.job_id, a.candidate_id, a.status, c.email, c.first_name, j.title from applications a join candidates c on c.id = a.candidate_id join jobs j on j.id = a.job_id where a.id = $1",
      [v.applicationId],
    );
    if (!app) throw new HttpError(404, "Application not found", "not_found");
    const done = await q("select 1 from assessment_attempts where application_id = $1 and status = 'completed'", [app.id]);
    if (done.length) throw new HttpError(409, "This candidate has already completed the Quick Check for this application", "already_completed");
    const attempt = await createAttempt(q, { orgId, applicationId: app.id, jobId: app.job_id, candidateId: app.candidate_id, invitedBy: access.user.id });
    if (!attempt) throw new HttpError(400, "Enable Quick Check for this job with 3–4 approved questions first", "not_ready");
    return { attempt, app };
  });
  const emailDelivery = v.sendEmail ? await emailInvite(orgId, r.app.email, r.app.first_name, r.app.title, access.org.name, r.attempt.token, r.attempt.config.language) : "skipped";
  await audit({ scope: "org", action: "assessment.invited", actorId: access.user.id, orgId, targetType: "application", targetId: v.applicationId });
  return json({ url: assessUrl(r.attempt.token), emailDelivery }, 201);
});
