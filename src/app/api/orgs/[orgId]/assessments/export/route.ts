import { tenantTx } from "@/server/db";
import { HttpError, handler } from "@/server/http";
import { audit, requireOrg } from "@/server/org";
import type { SnapshotQuestion } from "@/server/assessments";

const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV export of Quick Check responses for one job (or all). No scores, rankings or AI output. */
export const GET = handler(async (req, ctx: { params: Promise<{ orgId: string }> }) => {
  const access = await requireOrg((await ctx.params).orgId, "assessments.view");
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (jobId && !/^[a-z]+_[A-Za-z0-9]{3,48}$/.test(jobId)) throw new HttpError(400, "Invalid job", "validation");
  const rows = await tenantTx(access.org.id, access.user.id, (q) => q<{ full_name: string; email: string; title: string; status: string; accommodation: string; completed_at: Date | null; questions: SnapshotQuestion[]; position: number | null; answer_option_id: string | null; answer_text: string | null; timed_out: boolean | null; is_correct: boolean | null }>(
    `select c.full_name, c.email, j.title, t.status, t.accommodation, t.completed_at, t.questions, r.position, r.answer_option_id, r.answer_text, r.timed_out, r.is_correct
     from assessment_attempts t join candidates c on c.id = t.candidate_id join jobs j on j.id = t.job_id left join assessment_responses r on r.attempt_id = t.id
     where ($1::text is null or t.job_id = $1) order by t.created_at, r.position`, [jobId]));
  const header = ["Candidate", "Email", "Job", "Status", "Accommodation", "Completed at", "Question #", "Competency", "Question", "Answer", "Matches key", "Unanswered"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const qn = r.position != null ? r.questions[r.position] : null;
    const answer = qn?.type === "multiple_choice" ? (qn.options.find((o) => o.id === r.answer_option_id)?.text ?? "") : (r.answer_text ?? "");
    lines.push([r.full_name, r.email, r.title, r.status, r.accommodation, r.completed_at?.toISOString() ?? "", r.position != null ? r.position + 1 : "", qn?.competency ?? "", qn?.text ?? "", answer,
      r.is_correct == null ? "" : r.is_correct ? "yes" : "no", r.timed_out || (r.position != null && !r.answer_option_id && !r.answer_text) ? "yes" : ""].map(cell).join(","));
  }
  await audit({ scope: "org", action: "assessment.exported", actorId: access.user.id, orgId: access.org.id, metadata: { jobId } });
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="quick-check-${jobId ?? "all"}.csv"`, "Cache-Control": "no-store" } });
});
