import { z } from "zod";
import { tenantTx } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { audit, featureEnabled, requireOrg } from "@/server/org";
import { generateQuestions, QUESTION_GENERATION_VERSION } from "@/server/ai/tasks";
import { newId } from "@/server/cv";
import { rateLimit } from "@/server/security";

const Body = z.object({
  jobId: z.string().regex(/^[a-z]+_[A-Za-z0-9]{3,48}$/),
  count: z.number().int().min(3).max(6).default(4),
  language: z.enum(["en", "el"]).default("en"),
  competencies: z.string().trim().max(500).default(""),
  mix: z.enum(["multiple_choice", "mixed"]).default("multiple_choice"),
});

/**
 * Drafts Quick Check questions with Claude from the job's own data (title, seniority,
 * responsibilities, requirements, skills) - never from candidate data. Results are saved
 * as DRAFTS; a recruiter must review and approve each one before any candidate sees it.
 */
export const POST = handler(async (req, ctx: { params: Promise<{ orgId: string }> }) => {
  const access = await requireOrg((await ctx.params).orgId, "assessments.manage");
  const orgId = access.org.id;
  if (!(await featureEnabled(orgId, "quick_check"))) throw new HttpError(403, "Quick Check isn't enabled for this company", "feature_disabled");
  if (!rateLimit(`qgen:${orgId}`, 30, 60 * 60_000).ok) throw new HttpError(429, "Too many generation requests this hour. Try again later.", "rate_limited");
  const v = Body.parse(await req.json());
  const [job] = await tenantTx(orgId, access.user.id, (q) => q<{ title: string; seniority: string; summary: string; responsibilities: string; requirements: string; skills: string[]; preferred_skills: string[] }>(
    "select title, seniority, summary, responsibilities, requirements, skills, preferred_skills from jobs where id = $1", [v.jobId]));
  if (!job) throw new HttpError(404, "Job not found", "not_found");
  const r = await generateQuestions(orgId, { title: job.title, seniority: job.seniority, summary: job.summary, responsibilities: job.responsibilities, requirements: job.requirements, skills: job.skills, preferredSkills: job.preferred_skills }, v);
  const ids: string[] = [];
  await tenantTx(orgId, access.user.id, async (q) => {
    for (const g of r.questions) {
      const id = newId("aq");
      ids.push(id);
      await q(
        `insert into assessment_questions (id, org_id, question_text, type, options, correct_option_id, explanation, competency, difficulty, recommended_time_seconds, language, status, source, ai_model, generation_version, job_id, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft','ai',$12,$13,$14,$15)`,
        [id, orgId, g.question_text, g.type, JSON.stringify(g.type === "multiple_choice" ? g.options : []), g.type === "multiple_choice" ? g.correct_answer : null, g.explanation, g.competency, g.difficulty, g.recommended_time_seconds, g.language, r.model, QUESTION_GENERATION_VERSION, v.jobId, access.user.id],
      );
    }
  });
  await audit({ scope: "org", action: "assessment.questions_generated", actorId: access.user.id, orgId, targetType: "job", targetId: v.jobId, metadata: { count: ids.length, rejected: r.rejected.length, model: r.model } });
  return json({ ids, rejected: r.rejected, model: r.model }, 201);
});
