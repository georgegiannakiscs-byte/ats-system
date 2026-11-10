import "server-only";
import { z } from "zod";
import { claudeStructured } from "./claude";
import { HttpError } from "@/server/http";

export const QUESTION_GENERATION_VERSION = "qgen-2026-11-v1";
export const OBSERVATION_PROMPT_VERSION = "obs-2026-11-v1";

/* ───────────── Question generation ───────────── */

const GeneratedQuestion = z.object({
  question_text: z.string().describe("A short practical workplace scenario or decision, 1–3 sentences."),
  type: z.enum(["multiple_choice", "short_text"]),
  options: z.array(z.object({ id: z.enum(["A", "B", "C", "D"]), text: z.string() })).describe("Exactly 4 options for multiple_choice; empty for short_text."),
  correct_answer: z.string().nullable().describe("Option id of the single best answer for multiple_choice; null for short_text."),
  explanation: z.string().describe("Why the keyed answer is best (multiple_choice), or what a strong answer should cover (short_text)."),
  competency: z.string().describe("The job-related competency assessed."),
  difficulty: z.enum(["easy", "medium", "hard"]),
  recommended_time_seconds: z.number().int().describe("20–60 seconds."),
  language: z.enum(["en", "el"]),
});
const QuestionSet = z.object({ questions: z.array(GeneratedQuestion) });
export type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

const QGEN_SYSTEM = `You write short, practical screening questions for Déceler Quick Check, a 2-minute role-related check that recruiters review alongside a candidate's application.

Write questions that:
- describe a realistic workplace situation the role actually meets, and ask what to do or check first;
- match the role's seniority and the listed requirements;
- can be answered in 20–60 seconds by a competent practitioner;
- have one clearly best option and three plausible but clearly weaker options (multiple choice), with no "all of the above", trick wording or double negatives;
- avoid academic trivia, memorised definitions, brand-specific UI details, and anything that depends on unstated assumptions.

Never ask about, or rely on, personal characteristics (age, gender, nationality, health, family, religion, appearance, accent). Questions are about the job, not the person. Write in the requested language. Recruiters will review, edit and approve every question before any candidate sees it.`;

export async function generateQuestions(orgId: string, job: { title: string; seniority: string; summary: string; responsibilities: string; requirements: string; skills: string[]; preferredSkills: string[] }, opts: { count: number; language: "en" | "el"; competencies: string; mix: "multiple_choice" | "mixed" }) {
  const prompt = [
    `Role: ${job.title} (${job.seniority})`,
    job.summary && `About the role: ${job.summary}`,
    job.responsibilities && `Responsibilities:\n${job.responsibilities}`,
    job.requirements && `Requirements:\n${job.requirements}`,
    job.skills.length && `Required skills: ${job.skills.join(", ")}`,
    job.preferredSkills.length && `Preferred skills: ${job.preferredSkills.join(", ")}`,
    opts.competencies && `Competencies the recruiter wants covered: ${opts.competencies}`,
    `Write ${opts.count} questions in ${opts.language === "el" ? "Greek" : "English"}. ${opts.mix === "mixed" ? "Make at most one of them short_text (a brief written answer); the rest multiple_choice." : "All multiple_choice."}`,
  ].filter(Boolean).join("\n\n");
  const { data, model } = await claudeStructured({ orgId, feature: "question_generation", schema: QuestionSet, system: QGEN_SYSTEM, prompt, maxTokens: 8000 });
  // Deterministic validation — reject anything ambiguous or malformed rather than "fixing" it.
  const valid: GeneratedQuestion[] = [];
  const rejected: { question: string; reason: string }[] = [];
  for (const q of data.questions) {
    const reason = validateQuestion(q);
    if (reason) rejected.push({ question: q.question_text.slice(0, 120), reason });
    else valid.push({ ...q, recommended_time_seconds: Math.min(60, Math.max(20, q.recommended_time_seconds)) });
  }
  if (!valid.length) throw new HttpError(502, "The AI returned no usable questions. Try again or write questions manually.", "ai_no_valid_questions");
  return { questions: valid.slice(0, opts.count), rejected, model };
}

export function validateQuestion(q: Pick<GeneratedQuestion, "question_text" | "type" | "options" | "correct_answer">): string | null {
  const text = q.question_text.trim();
  if (text.length < 15 || text.length > 600) return "Question length out of range";
  if (q.type === "multiple_choice") {
    if (q.options.length < 3 || q.options.length > 6) return "Multiple choice needs 3–6 options";
    const ids = new Set<string>(q.options.map((o) => o.id));
    if (ids.size !== q.options.length) return "Duplicate option ids";
    const texts = new Set(q.options.map((o) => o.text.trim().toLowerCase()));
    if (texts.size !== q.options.length || q.options.some((o) => o.text.trim().length < 2)) return "Options must be distinct and non-empty";
    if (!q.correct_answer || !ids.has(q.correct_answer)) return "The correct answer must be one of the options";
    if (q.options.some((o) => /all of the above|none of the above|όλα τα παραπάνω|κανένα από τα παραπάνω/i.test(o.text))) return "Catch-all options are ambiguous";
  } else if (q.options.length) return "Written questions have no options";
  return null;
}

/* ───────────── Observations on written answers ───────────── */

const Observation = z.object({
  addresses_scenario: z.enum(["yes", "partially", "no", "unclear"]),
  relevant_concepts: z.array(z.string()).describe("Job-related concepts the answer explicitly mentions."),
  areas_to_clarify: z.array(z.string()).describe("Points a recruiter could ask about to understand the answer better."),
  follow_up_questions: z.array(z.string()).describe("1–3 neutral interview follow-up questions."),
});
export type Observation = z.infer<typeof Observation>;

const OBS_SYSTEM = `You help a recruiter read a short written answer from a role-related Quick Check. Describe only what the text of the answer says, against the question and its review criteria.

Do not score, rank or recommend. Do not draw conclusions about the person's experience level, honesty, personality, intelligence, language ability or likelihood of success, and do not speculate about whether they used help. A short answer written under time limits is limited evidence; say what is present and what a recruiter might clarify. Keep each item short. Use the language of the answer.`;

export async function observeAnswer(orgId: string, input: { question: string; criteria: string; competency: string; answer: string }) {
  const prompt = `Question: ${input.question}\nCompetency: ${input.competency}\nWhat a strong answer covers (recruiter's criteria): ${input.criteria}\n\nCandidate's answer:\n"""${input.answer.slice(0, 4000)}"""`;
  return claudeStructured({ orgId, feature: "response_observations", schema: Observation, system: OBS_SYSTEM, prompt, maxTokens: 2000, effort: "low" });
}

/* ───────────── CV writing help ───────────── */

const Suggestion = z.object({ suggestion: z.string(), notes: z.string().describe("One sentence on what was changed.") });

const SUMMARY_SYSTEM = `You improve the wording of a candidate's professional summary for their CV. Rewrite only for clarity, concision and a confident professional tone (2–4 sentences, first person implied, no buzzwords).

Use only facts that appear in the material provided. Never add employers, years, numbers, skills, tools, achievements or qualifications that are not there. If the material is too thin, keep the suggestion short rather than inventing detail. Write in the same language as the candidate's text.`;

export async function improveSummary(orgId: string, input: { summary: string; headline: string; titles: string[]; skills: string[] }) {
  const material = [`Summary: ${input.summary}`, input.headline && `Headline: ${input.headline}`, input.titles.length && `Job titles: ${input.titles.join("; ")}`, input.skills.length && `Skills: ${input.skills.join(", ")}`].filter(Boolean).join("\n");
  const { data, model } = await claudeStructured({ orgId, feature: "cv_summary", schema: Suggestion, system: SUMMARY_SYSTEM, prompt: material, maxTokens: 1500, effort: "low" });
  // Guard against invented figures: every number in the suggestion must appear in the input.
  const nums = (s: string) => new Set(s.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const allowed = nums(material);
  const invented = [...nums(data.suggestion)].filter((n) => !allowed.has(n));
  if (invented.length) throw new HttpError(422, "The suggestion included details you didn't provide, so it was discarded. Try again or edit your summary yourself.", "ai_invented_detail");
  return { ...data, model };
}

const ExtractedCv = z.object({
  fullName: z.string(), email: z.string(), phone: z.string(), location: z.string(), linkedinUrl: z.string(), portfolioUrl: z.string(), headline: z.string(), summary: z.string(),
  experience: z.array(z.object({ title: z.string(), company: z.string(), start: z.string(), end: z.string(), current: z.boolean(), description: z.string() })),
  education: z.array(z.object({ institution: z.string(), degree: z.string(), field: z.string(), start: z.string(), end: z.string() })),
  skills: z.array(z.string()),
  languages: z.array(z.object({ language: z.string(), level: z.string() })),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string(), date: z.string() })),
});
export type ExtractedCv = z.infer<typeof ExtractedCv>;

const EXTRACT_SYSTEM = `Extract the structured contents of a CV so the candidate can review it in a CV builder. Copy information exactly as written; use an empty string or empty list when something is not in the text. Do not infer, complete or embellish anything. Ignore and do not output personal details unrelated to work (date of birth, age, marital status, nationality, religion, health, photo descriptions, home address beyond city/country).`;

export async function structureCvText(orgId: string, text: string) {
  return claudeStructured({ orgId, feature: "cv_extract", schema: ExtractedCv, system: EXTRACT_SYSTEM, prompt: `CV text:\n"""${text.slice(0, 30000)}"""`, maxTokens: 8000, effort: "low" });
}
