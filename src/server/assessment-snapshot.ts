import "server-only";
import { sys, type Q } from "./db";
import { can, type OrgRole } from "./permissions";
import { aiConfigured, aiModel, aiUnavailableReason, type AiFeature } from "./ai/claude";
import type { SnapshotQuestion } from "./assessments";
import { configFromRow } from "./assessments";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);

/** Quick Check + CV Builder parts of the workspace snapshot. Runs inside the tenant (RLS) transaction. */
export async function assessmentSnapshot(q: Q, orgId: string, role: OrgRole) {
  const view = can(role, "assessments.view");
  const questions = view ? await q("select * from assessment_questions order by created_at desc") : [];
  const configs = view ? await q("select * from job_assessments") : [];
  const attempts = view ? await q("select * from assessment_attempts order by created_at desc") : [];
  // Status-only view for everyone who can see the pipeline (no answers).
  const statuses = view ? [] : await q<{ application_id: string; status: string }>("select application_id, status from assessment_attempts");
  const responses = view && attempts.length ? await q("select * from assessment_responses order by position") : [];
  const observations = view && attempts.length ? await q("select * from assessment_observations") : [];
  const profiles = await q<{ id: string; candidate_id: string; application_id: string | null; cv_document_id: string | null; template: string; created_at: Date }>("select id, candidate_id, application_id, cv_document_id, template, created_at from cv_builder_profiles order by created_at desc");
  const photos = await q<{ id: string; candidate_id: string }>("select id, candidate_id from candidate_photos order by created_at desc");

  return {
    assessmentQuestions: questions.map((x) => ({
      id: x.id, questionText: x.question_text, type: x.type, options: x.options, correctOptionId: x.correct_option_id, explanation: x.explanation, competency: x.competency, difficulty: x.difficulty,
      recommendedTimeSeconds: x.recommended_time_seconds, language: x.language, status: x.status, version: x.version, source: x.source, aiModel: x.ai_model ?? undefined, generationVersion: x.generation_version ?? undefined,
      jobId: x.job_id ?? undefined, createdBy: x.created_by ?? undefined, approvedBy: x.approved_by ?? undefined, approvedAt: iso(x.approved_at), createdAt: iso(x.created_at), updatedAt: iso(x.updated_at),
    })),
    jobAssessments: Object.fromEntries(configs.map((c) => [c.job_id, configFromRow(c as Parameters<typeof configFromRow>[0])])),
    assessmentAttempts: [
      ...attempts.map((t) => {
        const qs = t.questions as SnapshotQuestion[];
        return {
          id: t.id, applicationId: t.application_id, candidateId: t.candidate_id, jobId: t.job_id, status: t.status, accommodation: t.accommodation, setVersion: t.set_version, secondsPerQuestion: t.seconds_per_question,
          language: t.language, reviewerNotes: t.reviewer_notes, aiStatus: t.ai_status, invitedBy: t.invited_by ?? undefined, createdAt: iso(t.created_at), startedAt: iso(t.started_at), completedAt: iso(t.completed_at), expiresAt: iso(t.expires_at),
          responses: responses.filter((r) => r.attempt_id === t.id).map((r) => {
            const qn = qs[r.position];
            return {
              id: r.id, position: r.position, questionId: r.question_id, questionVersion: r.question_version, questionText: qn?.text ?? "", type: qn?.type ?? "multiple_choice", options: qn?.options ?? [], correctOptionId: qn?.correctOptionId ?? null,
              explanation: qn?.explanation ?? "", competency: qn?.competency ?? "", answerOptionId: r.answer_option_id ?? undefined, answerText: r.answer_text ?? undefined, timedOut: r.timed_out, isCorrect: r.is_correct ?? undefined,
              answered: Boolean(r.answer_option_id || r.answer_text),
              observation: (() => { const o = observations.find((ob) => ob.response_id === r.id); return o ? { model: o.model, promptVersion: o.prompt_version, ...o.data, createdAt: iso(o.created_at) } : undefined; })(),
            };
          }),
          total: qs.length,
        };
      }),
      ...statuses.map((s) => ({ applicationId: s.application_id, status: s.status, statusOnly: true as const })),
    ],
    cvBuilderProfiles: profiles.map((p) => ({ id: p.id, candidateId: p.candidate_id, applicationId: p.application_id ?? undefined, cvDocumentId: p.cv_document_id ?? undefined, template: p.template, createdAt: iso(p.created_at) })),
    candidatePhotos: photos.map((p) => ({ id: p.id, candidateId: p.candidate_id })),
  };
}

/** Company CV-Builder/AI settings plus whether each AI feature can run right now (and why not). */
export async function aiAndCvSettings(orgId: string) {
  const [o] = await sys<{ cv_settings: Record<string, unknown>; ai_settings: Record<string, boolean> }>("select cv_settings, ai_settings from organizations where id = $1", [orgId]);
  const [t] = await sys<{ value: { enabled: string[] } }>("select value from platform_settings where key = 'cv_templates'");
  const features: AiFeature[] = ["question_generation", "response_observations", "cv_summary", "cv_extract"];
  const availability = Object.fromEntries(await Promise.all(features.map(async (f) => [f, await aiUnavailableReason(orgId, f)] as const)));
  return {
    cvSettings: { templates: ["minimal", "modern", "professional"], defaultTemplate: "minimal", hidePhotos: false, ...o?.cv_settings, platformTemplates: t?.value.enabled ?? ["minimal", "modern", "professional"] },
    aiSettings: { question_generation: true, response_observations: true, cv_summary: true, cv_extract: true, ...o?.ai_settings },
    ai: { configured: aiConfigured(), model: aiConfigured() ? await aiModel() : null, unavailable: availability },
  };
}
