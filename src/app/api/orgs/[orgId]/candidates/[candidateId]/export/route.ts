import { tenantTx } from "@/server/db";
import { HttpError, handler } from "@/server/http";
import { audit, requireOrg } from "@/server/org";

/**
 * GDPR access request: everything this company holds about one candidate, as a JSON download.
 * CV and photo files are listed (name, type, date); download them from the profile.
 */
export const GET = handler(async (_req, ctx: { params: Promise<{ orgId: string; candidateId: string }> }) => {
  const { orgId, candidateId } = await ctx.params;
  const access = await requireOrg(orgId, "candidates.delete");
  if (!/^[a-z]+_[A-Za-z0-9]{3,48}$/.test(candidateId)) throw new HttpError(404, "Candidate not found", "not_found");
  const data = await tenantTx(orgId, access.user.id, async (q) => {
    const [candidate] = await q("select * from candidates where id = $1", [candidateId]);
    if (!candidate) return null;
    const applications = await q(
      `select a.id, j.title as job, a.stage, a.status, a.applied_at, a.stage_entered_at, a.source, a.utm, a.answers, a.rejection_reason, a.withdrawal_reason
       from applications a join jobs j on j.id = a.job_id where a.candidate_id = $1 order by a.applied_at`, [candidateId]);
    const stageHistory = await q(
      `select h.application_id, h.from_stage, h.to_stage, h.from_status, h.to_status, h.changed_at from stage_history h
       join applications a on a.id = h.application_id where a.candidate_id = $1 order by h.changed_at`, [candidateId]);
    const files = [
      ...(await q("select file_name, mime_type, size_bytes, created_at from cv_documents where candidate_id = $1", [candidateId])),
      ...(await q("select 'photo' as file_name, mime_type, created_at from candidate_photos where candidate_id = $1", [candidateId])),
    ];
    const notes = await q("select body, created_at from notes where candidate_id = $1 order by created_at", [candidateId]);
    const records = await q("select kind, data, updated_at from workspace_records where data->>'candidateId' = $1 order by updated_at", [candidateId]);
    const quickCheck = await q(
      `select t.id, t.status, t.accommodation, t.language, t.created_at, t.started_at, t.completed_at,
              coalesce((select jsonb_agg(to_jsonb(r) - 'org_id' - 'attempt_id' order by r.position) from assessment_responses r where r.attempt_id = t.id), '[]') as responses
       from assessment_attempts t where t.candidate_id = $1 order by t.created_at`, [candidateId]);
    const emails = await q("select subject, body, kind, status, created_at from email_outbox where lower(to_email) = lower($1) order by created_at", [(candidate as { email: string }).email]);
    return { exportedAt: new Date().toISOString(), candidate, applications, stageHistory, files, notes, interviewsScorecardsTasks: records, quickCheck, emails };
  });
  if (!data) throw new HttpError(404, "Candidate not found", "not_found");
  await audit({ scope: "org", action: "candidate.exported", actorId: access.user.id, orgId, targetType: "candidate", targetId: candidateId });
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="candidate-${candidateId}.json"`, "Cache-Control": "private, no-store" },
  });
});
