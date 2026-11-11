import "server-only";
import { z } from "zod";
import { sys, tenantTx } from "./db";
import { HttpError } from "./http";
import { audit, type OrgAccess } from "./org";
import { can, type Permission } from "./permissions";
import { validateQuestion } from "./ai/tasks";
import { MAX_QUESTIONS, MIN_QUESTIONS } from "./assessments";
import { CV_TEMPLATES } from "@/lib/cv/schema";

/*
 * Workspace commands for Quick Check and CV Builder settings. Every command checks the caller's
 * permission in this company and runs under RLS (tenantTx) for tenant data.
 */

const Str = (max = 500) => z.string().trim().max(max);
const QId = z.string().regex(/^aq_[A-Za-z0-9]{3,48}$/);
const JobId = z.string().regex(/^[a-z]+_[A-Za-z0-9]{3,48}$/);

export const QuestionInput = z.object({
  questionText: Str(600).min(10, "Write the question (at least 10 characters)"),
  type: z.enum(["multiple_choice", "short_text"]),
  options: z.array(z.object({ id: z.string().regex(/^[A-F]$/), text: Str(300).min(1) })).max(6).default([]),
  correctOptionId: z.string().regex(/^[A-F]$/).nullable().default(null),
  explanation: Str(1500).default(""),
  competency: Str(120).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  recommendedTimeSeconds: z.number().int().min(20).max(120).default(30),
  language: z.enum(["en", "el"]).default("en"),
  jobId: JobId.nullable().optional(),
});

const JobConfig = z.object({
  jobId: JobId,
  enabled: z.boolean(),
  questionIds: z.array(QId).max(MAX_QUESTIONS),
  timed: z.boolean(),
  secondsPerQuestion: z.number().int().min(20).max(60),
  language: z.enum(["en", "el"]),
  instructions: Str(1000),
  allowLater: z.boolean(),
  allowExtendedTime: z.boolean(),
  allowUntimed: z.boolean(),
  notifyRecruiter: z.boolean(),
});

function need(a: OrgAccess, p: Permission) {
  if (!can(a.role, p)) throw new HttpError(403, "You don't have permission to do that in this company", "forbidden");
}

export function questionProblem(v: z.infer<typeof QuestionInput>) {
  return validateQuestion({ question_text: v.questionText, type: v.type, options: v.options as { id: "A" | "B" | "C" | "D"; text: string }[], correct_answer: v.correctOptionId });
}

export async function runAssessmentCommand(a: OrgAccess, type: string, p: Record<string, unknown>) {
  const orgId = a.org.id;

  if (type === "settings.cvBuilder") {
    need(a, "settings.manage");
    const v = z.object({ templates: z.array(z.enum(CV_TEMPLATES)).min(1), defaultTemplate: z.enum(CV_TEMPLATES), hidePhotos: z.boolean() }).partial().parse(p);
    if (v.templates && v.defaultTemplate && !v.templates.includes(v.defaultTemplate)) throw new HttpError(400, "The default template must be one of the enabled templates", "validation");
    await sys("update organizations set cv_settings = cv_settings || $2::jsonb where id = $1", [orgId, JSON.stringify(v)]);
    await audit({ scope: "org", action: "company.cv_settings_updated", actorId: a.user.id, orgId, metadata: v });
    return;
  }
  if (type === "settings.ai") {
    need(a, "settings.manage");
    const v = z.object({ question_generation: z.boolean(), response_observations: z.boolean(), cv_summary: z.boolean(), cv_extract: z.boolean() }).partial().parse(p);
    await sys("update organizations set ai_settings = ai_settings || $2::jsonb where id = $1", [orgId, JSON.stringify(v)]);
    await audit({ scope: "org", action: "company.ai_settings_updated", actorId: a.user.id, orgId, metadata: v });
    return;
  }

  return tenantTx(orgId, a.user.id, async (q) => {
    switch (type) {
      case "assessments.question.save": {
        need(a, "assessments.manage");
        const id = QId.parse(p.id);
        const v = QuestionInput.parse(p.input);
        if (v.type === "short_text") { v.options = []; v.correctOptionId = null; }
        if (v.jobId) {
          const j = await q("select 1 from jobs where id = $1", [v.jobId]);
          if (!j.length) throw new HttpError(400, "Job not found", "validation");
        }
        const [existing] = await q<{ status: string; version: number }>("select status, version from assessment_questions where id = $1 for update", [id]);
        if (!existing) {
          await q(
            `insert into assessment_questions (id, org_id, question_text, type, options, correct_option_id, explanation, competency, difficulty, recommended_time_seconds, language, job_id, created_by, source)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual')`,
            [id, orgId, v.questionText, v.type, JSON.stringify(v.options), v.correctOptionId, v.explanation, v.competency, v.difficulty, v.recommendedTimeSeconds, v.language, v.jobId ?? null, a.user.id],
          );
          return;
        }
        if (existing.status === "archived") throw new HttpError(400, "Restore the question before editing it", "archived");
        // Editing creates a new version. An approved question goes back to draft and must be re-approved;
        // attempts already sent keep the exact version the candidate saw.
        await q(
          `update assessment_questions set question_text = $2, type = $3, options = $4, correct_option_id = $5, explanation = $6, competency = $7, difficulty = $8,
             recommended_time_seconds = $9, language = $10, job_id = coalesce($11, job_id), version = version + 1, status = 'draft', approved_by = null, approved_at = null, updated_at = now() where id = $1`,
          [id, v.questionText, v.type, JSON.stringify(v.options), v.correctOptionId, v.explanation, v.competency, v.difficulty, v.recommendedTimeSeconds, v.language, v.jobId ?? null],
        );
        return;
      }
      case "assessments.question.approve": {
        need(a, "assessments.manage");
        const id = QId.parse(p.id);
        const [row] = await q<{ question_text: string; type: "multiple_choice" | "short_text"; options: { id: string; text: string }[]; correct_option_id: string | null; status: string }>(
          "select question_text, type, options, correct_option_id, status from assessment_questions where id = $1 for update", [id]);
        if (!row) throw new HttpError(404, "Question not found", "not_found");
        const problem = validateQuestion({ question_text: row.question_text, type: row.type, options: row.options as { id: "A"; text: string }[], correct_answer: row.correct_option_id });
        if (problem) throw new HttpError(400, `This question can't be approved yet: ${problem}`, "invalid_question");
        await q("update assessment_questions set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() where id = $1", [id, a.user.id]);
        await audit({ scope: "org", action: "assessment.question_approved", actorId: a.user.id, orgId, targetType: "assessment_question", targetId: id });
        return;
      }
      case "assessments.question.archive":
      case "assessments.question.restore": {
        need(a, "assessments.manage");
        const id = QId.parse(p.id);
        await q("update assessment_questions set status = $2, updated_at = now() where id = $1", [id, type.endsWith("archive") ? "archived" : "draft"]);
        return;
      }
      case "assessments.question.delete": {
        need(a, "assessments.manage");
        const id = QId.parse(p.id);
        const [row] = await q<{ status: string }>("select status from assessment_questions where id = $1", [id]);
        if (!row) return;
        if (row.status !== "draft") throw new HttpError(400, "Only drafts can be deleted. Archive approved questions instead, so past results stay explainable.", "not_draft");
        await q("delete from assessment_questions where id = $1", [id]);
        await q("update job_assessments set question_ids = array_remove(question_ids, $1)", [id]);
        return;
      }
      case "assessments.job.save": {
        need(a, "assessments.manage");
        const v = JobConfig.parse(p);
        const [job] = await q("select id from jobs where id = $1", [v.jobId]);
        if (!job) throw new HttpError(404, "Job not found", "not_found");
        const ids = [...new Set(v.questionIds)];
        if (ids.length) {
          const found = await q<{ id: string; status: string }>("select id, status from assessment_questions where id = any($1)", [ids]);
          if (found.length !== ids.length) throw new HttpError(400, "Some questions weren't found", "validation");
          if (v.enabled && found.some((f) => f.status !== "approved")) throw new HttpError(400, "Only approved questions can be used in an enabled Quick Check", "not_approved");
        }
        if (v.enabled && (ids.length < MIN_QUESTIONS || ids.length > MAX_QUESTIONS)) throw new HttpError(400, `Choose ${MIN_QUESTIONS}–${MAX_QUESTIONS} approved questions to enable Quick Check`, "question_count");
        await q(
          `insert into job_assessments (job_id, org_id, enabled, question_ids, timed, seconds_per_question, language, instructions, allow_later, allow_extended_time, allow_untimed, notify_recruiter, updated_by, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
           on conflict (job_id) do update set enabled = excluded.enabled, question_ids = excluded.question_ids, timed = excluded.timed, seconds_per_question = excluded.seconds_per_question,
             language = excluded.language, instructions = excluded.instructions, allow_later = excluded.allow_later, allow_extended_time = excluded.allow_extended_time,
             allow_untimed = excluded.allow_untimed, notify_recruiter = excluded.notify_recruiter, updated_by = excluded.updated_by, updated_at = now()`,
          [v.jobId, orgId, v.enabled, ids, v.timed, v.secondsPerQuestion, v.language, v.instructions, v.allowLater, v.allowExtendedTime, v.allowUntimed, v.notifyRecruiter, a.user.id],
        );
        await audit({ scope: "org", action: "assessment.job_settings_updated", actorId: a.user.id, orgId, targetType: "job", targetId: v.jobId, metadata: { enabled: v.enabled, questions: ids.length } });
        return;
      }
      case "assessments.attempt.notes": {
        need(a, "assessments.view");
        const v = z.object({ attemptId: z.string().uuid(), notes: Str(4000) }).parse(p);
        await q("update assessment_attempts set reviewer_notes = $2 where id = $1", [v.attemptId, v.notes]);
        return;
      }
      case "assessments.attempt.revoke": {
        need(a, "assessments.manage");
        const v = z.object({ attemptId: z.string().uuid() }).parse(p);
        await q("update assessment_attempts set status = 'expired', expires_at = now() where id = $1 and status in ('invited','started')", [v.attemptId]);
        return;
      }
      default:
        throw new HttpError(400, `Unknown command ${type}`, "unknown_command");
    }
  });
}
