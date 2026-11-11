import "server-only";
import crypto from "node:crypto";
import { sys, sysTx, type Q } from "./db";
import { env } from "./env";
import { HttpError } from "./http";
import { featureEnabled } from "./org";
import { randomToken, sha256 } from "./security";
import { sendMail } from "./mail";
import { newId } from "./cv";
import { logoUrl } from "./branding";

/*
 * Quick Check: a short, optional, role-related check offered after applying.
 * - The application is complete without it; nothing here can advance or reject a candidate.
 * - Timing is enforced by the server (deadline per served question). Reloading never resets
 *   the clock, and a question whose deadline passes is recorded as unanswered.
 * - Multiple-choice answers are checked deterministically against the recruiter-approved key.
 */

export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 4;
const GRACE_MS = 3_000; // network latency allowance on top of the displayed time
const EXTENDED_MULTIPLIER = 2;
const INVITE_DAYS = 14;

export interface SnapshotQuestion {
  id: string;
  version: number;
  text: string;
  type: "multiple_choice" | "short_text";
  options: { id: string; text: string }[];
  correctOptionId: string | null;
  explanation: string;
  competency: string;
}

export interface JobAssessmentConfig {
  enabled: boolean;
  questionIds: string[];
  timed: boolean;
  secondsPerQuestion: number;
  language: "en" | "el";
  instructions: string;
  allowLater: boolean;
  allowExtendedTime: boolean;
  allowUntimed: boolean;
  notifyRecruiter: boolean;
}

export const DEFAULT_CONFIG: JobAssessmentConfig = {
  enabled: false, questionIds: [], timed: true, secondsPerQuestion: 30, language: "en", instructions: "",
  allowLater: true, allowExtendedTime: true, allowUntimed: true, notifyRecruiter: true,
};

type ConfigRow = { enabled: boolean; question_ids: string[]; timed: boolean; seconds_per_question: number; language: "en" | "el"; instructions: string; allow_later: boolean; allow_extended_time: boolean; allow_untimed: boolean; notify_recruiter: boolean };
export const configFromRow = (r: ConfigRow): JobAssessmentConfig => ({
  enabled: r.enabled, questionIds: r.question_ids, timed: r.timed, secondsPerQuestion: r.seconds_per_question, language: r.language, instructions: r.instructions,
  allowLater: r.allow_later, allowExtendedTime: r.allow_extended_time, allowUntimed: r.allow_untimed, notifyRecruiter: r.notify_recruiter,
});

/** Approved questions configured for a job, in configured order (only if the check can run). */
export async function readyQuickCheck(q: Q, orgId: string, jobId: string) {
  const [row] = await q<ConfigRow>("select * from job_assessments where org_id = $1 and job_id = $2", [orgId, jobId]);
  if (!row || !row.enabled) return null;
  const qs = await q<{ id: string; version: number; question_text: string; type: SnapshotQuestion["type"]; options: { id: string; text: string }[]; correct_option_id: string | null; explanation: string; competency: string }>(
    "select id, version, question_text, type, options, correct_option_id, explanation, competency from assessment_questions where org_id = $1 and id = any($2) and status = 'approved'",
    [orgId, row.question_ids],
  );
  const byId = new Map(qs.map((x) => [x.id, x]));
  const ordered = row.question_ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x)).slice(0, MAX_QUESTIONS);
  if (ordered.length < MIN_QUESTIONS) return null;
  const questions: SnapshotQuestion[] = ordered.map((x) => ({ id: x.id, version: x.version, text: x.question_text, type: x.type, options: x.options, correctOptionId: x.correct_option_id, explanation: x.explanation, competency: x.competency }));
  return { config: configFromRow(row), questions };
}

/** Creates an invitation for an application (idempotent: reuses an open one). Returns the raw token once. */
export async function createAttempt(q: Q, input: { orgId: string; applicationId: string; jobId: string; candidateId: string; invitedBy: string | null }) {
  if (!(await featureEnabled(input.orgId, "quick_check"))) return null;
  const ready = await readyQuickCheck(q, input.orgId, input.jobId);
  if (!ready) return null;
  const token = randomToken();
  const open = await q<{ id: string }>("select id from assessment_attempts where org_id = $1 and application_id = $2 and status in ('invited','started')", [input.orgId, input.applicationId]);
  if (open.length) {
    // Re-issue the link (the old token stops working) — used for "send again".
    await q("update assessment_attempts set token_hash = $2, expires_at = greatest(expires_at, now() + make_interval(days => $3)) where id = $1", [open[0].id, sha256(token), INVITE_DAYS]);
    return { attemptId: open[0].id, token, config: ready.config, count: ready.questions.length };
  }
  const setVersion = crypto.createHash("sha256").update(ready.questions.map((x) => `${x.id}@${x.version}`).join(",")).digest("hex").slice(0, 16);
  const [a] = await q<{ id: string }>(
    `insert into assessment_attempts (org_id, application_id, job_id, candidate_id, token_hash, questions, set_version, seconds_per_question, language, invited_by, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + make_interval(days => $11)) returning id`,
    [input.orgId, input.applicationId, input.jobId, input.candidateId, sha256(token), JSON.stringify(ready.questions), setVersion, ready.config.timed ? ready.config.secondsPerQuestion : null, ready.config.language, input.invitedBy, INVITE_DAYS],
  );
  return { attemptId: a.id, token, config: ready.config, count: ready.questions.length };
}

export const assessUrl = (token: string) => `${env.appUrl}/assess/${token}`;

export async function emailInvite(orgId: string, to: string, firstName: string, jobTitle: string, orgName: string, token: string, lang: "en" | "el") {
  const url = assessUrl(token);
  const subject = lang === "el" ? `Quick Check για τη θέση ${jobTitle}` : `Your Quick Check for ${jobTitle}`;
  const body = lang === "el"
    ? `Γεια σας ${firstName},\n\nΗ αίτησή σας για τη θέση ${jobTitle} στην ${orgName} έχει καταχωριστεί. Αν θέλετε, μπορείτε να ολοκληρώσετε ένα σύντομο Quick Check (3–4 ερωτήσεις, περίπου 2 λεπτά). Είναι προαιρετικό και η αίτησή σας ισχύει σε κάθε περίπτωση.\n\n${url}\n\nΟ σύνδεσμος ισχύει για ${INVITE_DAYS} ημέρες.\n\n${orgName}`
    : `Hi ${firstName},\n\nYour application for ${jobTitle} at ${orgName} is complete. If you'd like, you can take a short Quick Check (3–4 questions, about 2 minutes). It's optional and your application stands either way.\n\n${url}\n\nThis link is valid for ${INVITE_DAYS} days.\n\n${orgName}`;
  return sendMail(orgId, to, subject, body, "quick_check_invite");
}

/* ───────────── Candidate side (token-authorised, system context) ───────────── */

type AttemptRow = {
  id: string; org_id: string; application_id: string; job_id: string; candidate_id: string; status: string; accommodation: "none" | "extended" | "untimed";
  questions: SnapshotQuestion[]; seconds_per_question: number | null; language: "en" | "el"; current_index: number; expires_at: Date; started_at: Date | null; completed_at: Date | null;
};

async function byToken(q: Q, token: string, lock = false) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(404, "This Quick Check link isn't valid", "not_found");
  const [a] = await q<AttemptRow>(`select * from assessment_attempts where token_hash = $1${lock ? " for update" : ""}`, [sha256(token)]);
  if (!a) throw new HttpError(404, "This Quick Check link isn't valid or has been replaced by a newer one", "not_found");
  if (a.status !== "completed" && a.status !== "declined" && a.expires_at.getTime() < Date.now()) {
    await q("update assessment_attempts set status = 'expired' where id = $1 and status in ('invited','started')", [a.id]);
    a.status = "expired";
  }
  return a;
}

const effectiveSeconds = (a: Pick<AttemptRow, "seconds_per_question" | "accommodation">) =>
  a.seconds_per_question == null || a.accommodation === "untimed" ? null : a.seconds_per_question * (a.accommodation === "extended" ? EXTENDED_MULTIPLIER : 1);

type ResponseRow = { id: string; position: number; served_at: Date; deadline_at: Date | null; answered_at: Date | null };

/** Times out an expired served question and serves the next one. Must run inside a transaction holding the attempt lock. */
async function advance(q: Q, a: AttemptRow) {
  for (;;) {
    if (a.current_index >= a.questions.length) {
      await finish(q, a);
      return;
    }
    const [r] = await q<ResponseRow>("select id, position, served_at, deadline_at, answered_at from assessment_responses where attempt_id = $1 and position = $2", [a.id, a.current_index]);
    if (!r) {
      const seconds = effectiveSeconds(a);
      const qn = a.questions[a.current_index];
      await q(
        "insert into assessment_responses (org_id, attempt_id, question_id, question_version, position, deadline_at) values ($1,$2,$3,$4,$5, case when $6::int is null then null else now() + make_interval(secs => $6::int) end)",
        [a.org_id, a.id, qn.id, qn.version, a.current_index, seconds],
      );
      return;
    }
    if (r.answered_at || (r.deadline_at && r.deadline_at.getTime() + GRACE_MS < Date.now())) {
      if (!r.answered_at) await q("update assessment_responses set timed_out = true, answered_at = deadline_at where id = $1", [r.id]);
      a.current_index += 1;
      await q("update assessment_attempts set current_index = $2 where id = $1", [a.id, a.current_index]);
      continue;
    }
    return; // current question still open
  }
}

async function finish(q: Q, a: AttemptRow) {
  if (a.status === "completed") return;
  const observe = a.questions.some((x) => x.type === "short_text") && (await featureEnabled(a.org_id, "ai_assessment_observations"));
  await q("update assessment_attempts set status = 'completed', completed_at = now(), ai_status = $2 where id = $1", [a.id, observe ? "pending" : "not_requested"]);
  a.status = "completed";
  const [info] = await q<{ recruiter_id: string | null; title: string; full_name: string; notify: boolean | null }>(
    `select j.recruiter_id, j.title, c.full_name, ja.notify_recruiter as notify from jobs j join candidates c on c.id = $2 left join job_assessments ja on ja.job_id = j.id where j.id = $1`,
    [a.job_id, a.candidate_id],
  );
  if (info?.recruiter_id && info.notify !== false) {
    await q("insert into workspace_records (org_id, kind, id, data) values ($1,'notification',$2,$3)", [
      a.org_id, newId("no"), JSON.stringify({ userId: info.recruiter_id, title: "Quick Check completed", body: `${info.full_name} completed the Quick Check for ${info.title}. Review it on their profile.`, href: `/candidates/view?id=${a.candidate_id}`, createdAt: new Date().toISOString(), read: false }),
    ]);
  }
  await q("insert into activities (org_id, kind, candidate_id, job_id, message) values ($1,'quick_check',$2,$3,$4)", [a.org_id, a.candidate_id, a.job_id, `completed the Quick Check for ${info?.title ?? "a job"}`]);
}

/** Public, candidate-safe view of an attempt. Never includes answer keys or explanations. */
async function view(q: Q, a: AttemptRow) {
  const [ctx] = await q<{ org_name: string; org_slug: string; branding: Record<string, unknown>; job_title: string; job_slug: string; first_name: string; cfg: ConfigRow | null }>(
    `select o.name as org_name, o.slug as org_slug, o.branding, j.title as job_title, j.slug as job_slug, c.first_name, to_jsonb(ja) as cfg
     from assessment_attempts t join organizations o on o.id = t.org_id join jobs j on j.id = t.job_id join candidates c on c.id = t.candidate_id
     left join job_assessments ja on ja.job_id = t.job_id where t.id = $1`,
    [a.id],
  );
  const cfg = ctx.cfg ? configFromRow(ctx.cfg) : DEFAULT_CONFIG;
  const base = {
    status: a.status,
    company: { name: ctx.org_name, slug: ctx.org_slug, primaryColor: (ctx.branding?.primaryColor as string) ?? null, logoUrl: logoUrl(a.org_id, ctx.branding ?? {}) },
    jobSlug: ctx.job_slug,
    jobTitle: ctx.job_title,
    firstName: ctx.first_name,
    language: a.language,
    total: a.questions.length,
    timed: a.seconds_per_question != null,
    secondsPerQuestion: a.seconds_per_question,
    accommodation: a.accommodation,
    instructions: cfg.instructions,
    allowExtendedTime: cfg.allowExtendedTime,
    allowUntimed: cfg.allowUntimed,
    hasWritten: a.questions.some((x) => x.type === "short_text"),
  };
  if (a.status !== "started") return { ...base, current: null };
  const [r] = await q<ResponseRow>("select id, position, served_at, deadline_at, answered_at from assessment_responses where attempt_id = $1 and position = $2", [a.id, a.current_index]);
  const qn = a.questions[a.current_index];
  return {
    ...base,
    current: {
      position: a.current_index,
      type: qn.type,
      text: qn.text,
      options: qn.options.map((o) => ({ id: o.id, text: o.text })),
      deadlineAt: r?.deadline_at?.toISOString() ?? null,
      remainingMs: r?.deadline_at ? Math.max(0, r.deadline_at.getTime() - Date.now()) : null,
      serverNow: new Date().toISOString(),
    },
  };
}

export type AttemptView = Awaited<ReturnType<typeof view>>;

export async function attemptView(token: string) {
  return sysTx(async (q) => {
    const a = await byToken(q, token, true);
    if (a.status === "started") await advance(q, a);
    return view(q, a);
  });
}

export async function startAttempt(token: string, accommodation: "none" | "extended" | "untimed") {
  return sysTx(async (q) => {
    const a = await byToken(q, token, true);
    if (a.status === "started") {
      await advance(q, a);
      return view(q, a);
    }
    if (a.status !== "invited") throw new HttpError(409, statusMessage(a.status), a.status);
    const [ja] = await q<ConfigRow>("select * from job_assessments where job_id = $1", [a.job_id]);
    const cfg = ja ? configFromRow(ja) : DEFAULT_CONFIG;
    if (accommodation === "extended" && !cfg.allowExtendedTime && a.seconds_per_question != null) throw new HttpError(400, "Extended time isn't offered for this Quick Check. Contact the company if you need an adjustment.", "accommodation");
    if (accommodation === "untimed" && !cfg.allowUntimed && a.seconds_per_question != null) throw new HttpError(400, "Untimed mode isn't offered for this Quick Check. Contact the company if you need an adjustment.", "accommodation");
    a.accommodation = a.seconds_per_question == null ? "none" : accommodation;
    a.status = "started";
    await q("update assessment_attempts set status = 'started', started_at = now(), accommodation = $2 where id = $1", [a.id, a.accommodation]);
    await advance(q, a);
    return view(q, a);
  });
}

export async function answerAttempt(token: string, input: { position: number; optionId?: string | null; text?: string | null }) {
  return sysTx(async (q) => {
    const a = await byToken(q, token, true);
    if (a.status !== "started") throw new HttpError(409, statusMessage(a.status), a.status);
    await advance(q, a); // may time out the current question first
    if (a.status !== "started" || input.position !== a.current_index) {
      // The answer arrived after the server deadline (or for an old question): it is not recorded.
      return { ...(await view(q, a)), late: true };
    }
    const qn = a.questions[a.current_index];
    const [r] = await q<ResponseRow>("select id, deadline_at from assessment_responses where attempt_id = $1 and position = $2", [a.id, a.current_index]);
    let optionId: string | null = null;
    let text: string | null = null;
    let correct: boolean | null = null;
    if (qn.type === "multiple_choice") {
      if (!input.optionId || !qn.options.some((o) => o.id === input.optionId)) throw new HttpError(400, "Choose one of the options", "invalid_option");
      optionId = input.optionId;
      correct = optionId === qn.correctOptionId; // deterministic — never decided by AI
    } else {
      text = String(input.text ?? "").trim().slice(0, 2000);
      if (!text) throw new HttpError(400, "Write a short answer, or skip the question", "empty_answer");
    }
    await q("update assessment_responses set answered_at = now(), answer_option_id = $2, answer_text = $3, is_correct = $4 where id = $1", [r.id, optionId, text, correct]);
    await advance(q, a);
    return { ...(await view(q, a)), late: false };
  }).then(async (v) => {
    if (v.status === "completed") void runObservationsForToken(token);
    return v;
  });
}

/** Skips the current question (recorded as unanswered, never penalised differently from a time-out). */
export async function skipQuestion(token: string, position: number) {
  return sysTx(async (q) => {
    const a = await byToken(q, token, true);
    if (a.status !== "started") throw new HttpError(409, statusMessage(a.status), a.status);
    await advance(q, a);
    if (a.status === "started" && position === a.current_index) {
      await q("update assessment_responses set answered_at = now() where attempt_id = $1 and position = $2 and answered_at is null", [a.id, position]);
      await advance(q, a);
    }
    return view(q, a);
  });
}

export async function declineAttempt(token: string) {
  return sysTx(async (q) => {
    const a = await byToken(q, token, true);
    if (a.status !== "invited") throw new HttpError(409, statusMessage(a.status), a.status);
    await q("update assessment_attempts set status = 'declined', completed_at = now() where id = $1", [a.id]);
    a.status = "declined";
    return view(q, a);
  });
}

function statusMessage(s: string) {
  return s === "completed" ? "You've already completed this Quick Check." : s === "declined" ? "You chose not to take this Quick Check." : s === "expired" ? "This Quick Check link has expired. Your application is still active." : "This Quick Check isn't available.";
}

/* ───────────── Optional AI observations (written answers only) ───────────── */

async function runObservationsForToken(token: string) {
  try {
    const [a] = await sys<{ id: string }>("select id from assessment_attempts where token_hash = $1 and ai_status = 'pending'", [sha256(token)]);
    if (a) await runObservations(a.id);
  } catch (e) {
    console.error("[quick-check] observations failed", (e as Error).message);
  }
}

export async function runObservations(attemptId: string) {
  const { observeAnswer, OBSERVATION_PROMPT_VERSION } = await import("./ai/tasks");
  const [a] = await sys<AttemptRow>("select * from assessment_attempts where id = $1", [attemptId]);
  if (!a) return;
  if (!(await featureEnabled(a.org_id, "ai_assessment_observations"))) {
    await sys("update assessment_attempts set ai_status = 'disabled' where id = $1", [a.id]);
    return;
  }
  const rs = await sys<{ id: string; position: number; answer_text: string | null }>("select id, position, answer_text from assessment_responses where attempt_id = $1 order by position", [a.id]);
  let failed = false;
  for (const r of rs) {
    const qn = a.questions[r.position];
    if (qn?.type !== "short_text" || !r.answer_text) continue;
    try {
      const { data, model } = await observeAnswer(a.org_id, { question: qn.text, criteria: qn.explanation, competency: qn.competency, answer: r.answer_text });
      await sys("insert into assessment_observations (org_id, attempt_id, response_id, model, prompt_version, data) values ($1,$2,$3,$4,$5,$6)", [a.org_id, a.id, r.id, model, OBSERVATION_PROMPT_VERSION, JSON.stringify(data)]);
    } catch {
      failed = true;
    }
  }
  await sys("update assessment_attempts set ai_status = $2 where id = $1", [a.id, failed ? "failed" : "done"]);
}
