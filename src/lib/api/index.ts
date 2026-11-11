"use client";
/**
 * Workspace API used by every screen. Each method:
 *   1. applies the change optimistically to the local workspace (instant UI),
 *   2. sends an authorised command to the server (`send`), which validates,
 *      checks permissions for THIS company and persists it under RLS,
 *   3. the store re-syncs from the server afterwards (rollback on error).
 */
import type {
  Activity, ActivityKind, Application, AssessmentQuestion, JobAssessmentConfig, Candidate, CompanyProfile, Database, EmailTemplate, ID, Interview, Job, JobStatus, Note,
  NotificationPrefs, OrgBranding, Role, SavedView, Scorecard, StageConfig, StageId, Task, TalentList,
} from "@/lib/types";
import { apiFetch, currentOrgId, getState, loadWorkspace, send, setState } from "./store";
import { uid } from "@/lib/utils";

const now = () => new Date().toISOString();

function localActivity(db: Database, kind: ActivityKind, message: string, refs: { candidateId?: ID; jobId?: ID } = {}): Database {
  const a: Activity = { id: uid("act"), kind, actorId: db.currentUserId, message, createdAt: now(), ...refs };
  return { ...db, activities: [a, ...db.activities] };
}

/* ───────────────────────── Jobs ───────────────────────── */
export type JobInput = Omit<Job, "id" | "createdAt" | "publishedAt" | "slug">;

const jobs = {
  async create(input: JobInput) {
    const job: Job = { ...input, id: uid("j"), createdAt: now(), publishedAt: input.status === "published" ? now() : undefined };
    setState((db) => localActivity({ ...db, jobs: [job, ...db.jobs] }, "job_created", `created the job ${job.title}`, { jobId: job.id }));
    await send("jobs.create", { id: job.id, input: { ...input, hiringManagerId: input.hiringManagerId || null, recruiterId: input.recruiterId || null } });
    return job;
  },
  async update(id: ID, patch: Partial<Job>) {
    setState((db) => ({ ...db, jobs: db.jobs.map((j) => (j.id === id ? { ...j, ...patch, publishedAt: patch.status === "published" ? j.publishedAt ?? now() : j.publishedAt } : j)) }));
    const { id: _i, createdAt: _c, publishedAt: _p, slug: _s, ...rest } = patch as Job;
    await send("jobs.update", { id, patch: rest });
    return getState().jobs.find((j) => j.id === id)!;
  },
  setStatus(id: ID, status: JobStatus) {
    return jobs.update(id, { status });
  },
  async duplicate(id: ID) {
    const src = getState().jobs.find((j) => j.id === id);
    if (!src) throw new Error("Job not found");
    const { id: _id, createdAt: _c, publishedAt: _p, slug: _s, ...rest } = src;
    return jobs.create({ ...rest, title: `${src.title} (copy)`, status: "draft" });
  },
  async remove(id: ID) {
    setState((db) => ({ ...db, jobs: db.jobs.filter((j) => j.id !== id), applications: db.applications.filter((a) => a.jobId !== id) }));
    await send("jobs.remove", { id });
    return true;
  },
};

/* ────────────────────── Applications ───────────────────── */
const applications = {
  async move(id: ID, stage: StageId, index?: number) {
    setState((db) => {
      const app = db.applications.find((a) => a.id === id);
      if (!app) return db;
      const changed = app.stage !== stage;
      const moved: Application = { ...app, stage, status: stage === "hired" ? "hired" : "active", stageEnteredAt: changed ? now() : app.stageEnteredAt, evaluation: changed && app.evaluation === "none" ? "pending" : app.evaluation };
      const column = db.applications.filter((a) => a.jobId === app.jobId && a.stage === stage && a.id !== id && a.status !== "rejected" && a.status !== "withdrawn").sort((a, b) => a.order - b.order);
      column.splice(index ?? column.length, 0, moved);
      const order = new Map(column.map((a, i) => [a.id, i]));
      return { ...db, applications: db.applications.map((a) => (a.id === id ? { ...moved, order: order.get(id)! } : order.has(a.id) ? { ...a, order: order.get(a.id)! } : a)) };
    });
    await send("applications.move", { id, stage, index });
    return getState().applications.find((a) => a.id === id)!;
  },
  async reject(id: ID, reason: string, addToPool: boolean) {
    setState((db) => ({ ...db, applications: db.applications.map((a) => (a.id === id ? { ...a, status: "rejected", rejectionReason: reason, stageEnteredAt: now() } : a)) }));
    await send("applications.reject", { id, reason, addToPool });
    return true;
  },
  async withdraw(id: ID, reason: string) {
    setState((db) => ({ ...db, applications: db.applications.map((a) => (a.id === id ? { ...a, status: "withdrawn", withdrawalReason: reason, stageEnteredAt: now() } : a)) }));
    await send("applications.withdraw", { id, reason });
    return true;
  },
  async restore(id: ID) {
    setState((db) => ({ ...db, applications: db.applications.map((a) => (a.id === id ? { ...a, status: "active", rejectionReason: undefined, withdrawalReason: undefined } : a)) }));
    await send("applications.restore", { id });
    return true;
  },
  hire(id: ID) {
    return applications.move(id, "hired");
  },
  async setRecruiter(id: ID, recruiterId: ID) {
    setState((db) => ({ ...db, applications: db.applications.map((a) => (a.id === id ? { ...a, recruiterId } : a)) }));
    await send("applications.setRecruiter", { id, recruiterId });
    return true;
  },
  async create(candidateId: ID, jobId: ID) {
    const db = getState();
    if (db.applications.some((a) => a.candidateId === candidateId && a.jobId === jobId && a.status === "active")) throw new Error("Candidate is already in this job's pipeline");
    const app: Application = { id: uid("a"), candidateId, jobId, stage: "applied", status: "active", appliedAt: now(), stageEnteredAt: now(), recruiterId: db.jobs.find((j) => j.id === jobId)?.recruiterId || db.currentUserId, evaluation: "none", order: -1 };
    setState((s) => ({ ...s, applications: [...s.applications, app] }));
    await send("applications.create", { id: app.id, candidateId, jobId });
    return app;
  },
};

/* ─────────────────────── Candidates ────────────────────── */
export type CandidateInput = Pick<Candidate, "email" | "phone" | "location" | "headline" | "currentCompany" | "linkedinUrl" | "source" | "tags" | "skills"> & { fullName: string };

const candidates = {
  async create(input: CandidateInput, jobId?: ID) {
    const [firstName, ...rest] = input.fullName.trim().split(/\s+/);
    const c: Candidate = { ...input, id: uid("c"), firstName, lastName: rest.join(" "), experience: [], education: [], summary: "", languages: [], hue: Math.floor(Math.random() * 360), createdAt: now(), inTalentPool: !jobId };
    const applicationId = uid("a");
    await send("candidates.create", { id: c.id, input: { ...input, linkedinUrl: input.linkedinUrl || "" }, jobId, applicationId });
    return c;
  },
  async update(id: ID, patch: Partial<Candidate>) {
    setState((db) => ({ ...db, candidates: db.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    const allowed = ["fullName", "firstName", "lastName", "email", "phone", "location", "headline", "currentCompany", "linkedinUrl", "portfolioUrl", "githubUrl", "source", "tags", "skills", "languages", "summary", "extra", "inTalentPool"];
    const body = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
    if (patch.firstName !== undefined || patch.lastName !== undefined) {
      const c = getState().candidates.find((x) => x.id === id)!;
      body.fullName = `${patch.firstName ?? c.firstName} ${patch.lastName ?? c.lastName}`.trim();
    }
    await send("candidates.update", { id, patch: body });
    return getState().candidates.find((c) => c.id === id)!;
  },
  async setTalentPool(ids: ID[], inPool: boolean) {
    setState((db) => ({ ...db, candidates: db.candidates.map((c) => (ids.includes(c.id) ? { ...c, inTalentPool: inPool } : c)) }));
    await send("candidates.bulk", { ids, inTalentPool: inPool });
    return true;
  },
  async addTags(ids: ID[], tags: string[]) {
    setState((db) => ({ ...db, candidates: db.candidates.map((c) => (ids.includes(c.id) ? { ...c, tags: Array.from(new Set([...c.tags, ...tags])) } : c)) }));
    await send("candidates.bulk", { ids, addTags: tags });
    return true;
  },
  /** Uploads a CV for an existing candidate (recruiter upload). */
  async uploadCv(candidateId: ID, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await apiFetch<{ scanStatus: string }>(`/api/orgs/${currentOrgId()}/candidates/${candidateId}/cv`, { method: "POST", body: fd });
    await loadWorkspace(currentOrgId()!);
    return r;
  },
  /** Returns a short-lived signed URL for a CV document. */
  cvUrl(docId: string, download = false) {
    return apiFetch<{ url: string }>(`/api/orgs/${currentOrgId()}/cv/${docId}${download ? "?download=1" : ""}`);
  },
};

/* ───────────────────────── Notes ───────────────────────── */
const notes = {
  async add(candidateId: ID, body: string) {
    const note: Note = { id: uid("n"), candidateId, authorId: getState().currentUserId, body, createdAt: now() };
    setState((db) => ({ ...db, notes: [note, ...db.notes] }));
    await send("notes.add", { id: note.id, candidateId, body });
    return note;
  },
  async update(id: ID, patch: Partial<Note>) {
    setState((db) => ({ ...db, notes: db.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
    await send("notes.update", { id, body: patch.body, pinned: patch.pinned });
    return true;
  },
  async remove(id: ID) {
    setState((db) => ({ ...db, notes: db.notes.filter((n) => n.id !== id) }));
    await send("notes.remove", { id });
    return true;
  },
};

/* Phase 2 entities, persisted as company-scoped records. */
async function upsert<T extends { id: string }>(kind: string, key: keyof Database, item: T, extra: Record<string, unknown> = {}) {
  setState((db) => {
    const list = db[key] as unknown as T[];
    const exists = list.some((x) => x.id === item.id);
    return { ...db, [key]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] };
  });
  const { id, ...data } = item;
  await send("records.upsert", { kind, id, data, ...extra });
  return item;
}
async function removeRecord(kind: string, key: keyof Database, id: string) {
  setState((db) => ({ ...db, [key]: (db[key] as unknown as { id: string }[]).filter((x) => x.id !== id) }));
  await send("records.delete", { kind, id });
  return true;
}

/* ─────────────────────── Interviews ────────────────────── */
export type InterviewInput = Omit<Interview, "id" | "createdAt" | "status">;
const interviews = {
  schedule(input: InterviewInput) {
    const interview: Interview = { ...input, id: uid("i"), status: "scheduled", createdAt: now() };
    const c = getState().candidates.find((x) => x.id === input.candidateId);
    return upsert("interview", "interviews", interview, { activity: `scheduled a ${input.kind.toLowerCase()} with ${c ? `${c.firstName} ${c.lastName}` : "a candidate"}` });
  },
  async update(id: ID, patch: Partial<Interview>) {
    const cur = getState().interviews.find((i) => i.id === id)!;
    await upsert("interview", "interviews", { ...cur, ...patch });
    return true;
  },
  cancel(id: ID) {
    return interviews.update(id, { status: "cancelled" });
  },
};

/* ─────────────────────── Scorecards ────────────────────── */
const scorecards = {
  async submit(input: Omit<Scorecard, "id" | "submittedAt" | "authorId">) {
    const card: Scorecard = { ...input, id: uid("s"), authorId: getState().currentUserId, submittedAt: now() };
    setState((db) => ({ ...db, scorecards: [card, ...db.scorecards] }));
    await send("scorecards.submit", { card });
    return card;
  },
};

/* ───────────────────────── Tasks ───────────────────────── */
export type TaskInput = Omit<Task, "id" | "createdAt" | "done" | "completedAt">;
const tasks = {
  create(input: TaskInput) {
    return upsert("task", "tasks", { ...input, id: uid("t"), createdAt: now(), done: false } as Task);
  },
  async update(id: ID, patch: Partial<Task>) {
    const cur = getState().tasks.find((t) => t.id === id)!;
    await upsert("task", "tasks", { ...cur, ...patch });
    return true;
  },
  async toggle(id: ID) {
    const t = getState().tasks.find((x) => x.id === id)!;
    const done = !t.done;
    await upsert("task", "tasks", { ...t, done, completedAt: done ? now() : undefined });
    if (done) await send("activity.log", { kind: "task_completed", message: `completed “${t.title}”`, candidateId: t.candidateId, jobId: t.jobId }).catch(() => {});
    return true;
  },
  remove(id: ID) {
    return removeRecord("task", "tasks", id);
  },
};

/* ────────────────────── Talent lists ───────────────────── */
const talentLists = {
  async create(name: string, description?: string, candidateIds: ID[] = []) {
    const list: TalentList = { id: uid("l"), name, description, candidateIds, createdAt: now() };
    await upsert("talent_list", "talentLists", list);
    if (candidateIds.length) await candidates.setTalentPool(candidateIds, true);
    return list;
  },
  async addCandidates(listId: ID, ids: ID[]) {
    const l = getState().talentLists.find((x) => x.id === listId)!;
    await upsert("talent_list", "talentLists", { ...l, candidateIds: Array.from(new Set([...l.candidateIds, ...ids])) });
    await candidates.setTalentPool(ids, true);
    return true;
  },
  async removeCandidate(listId: ID, id: ID) {
    const l = getState().talentLists.find((x) => x.id === listId)!;
    await upsert("talent_list", "talentLists", { ...l, candidateIds: l.candidateIds.filter((x) => x !== id) });
    return true;
  },
  remove(listId: ID) {
    return removeRecord("talent_list", "talentLists", listId);
  },
};

/* ────────────────────── Saved views ────────────────────── */
const views = {
  save(view: Omit<SavedView, "id">) {
    return upsert("saved_view", "savedViews", { ...view, id: uid("v") });
  },
  async update(id: ID, patch: Partial<SavedView>) {
    const cur = getState().savedViews.find((v) => v.id === id)!;
    await upsert("saved_view", "savedViews", { ...cur, ...patch });
    return true;
  },
  remove(id: ID) {
    return removeRecord("saved_view", "savedViews", id);
  },
};

/* ──────────────────── Settings & team ──────────────────── */
const settings = {
  async updateCompany(patch: Partial<CompanyProfile>) {
    setState((db) => ({ ...db, company: { ...db.company, ...patch }, org: { ...db.org, name: patch.name ?? db.org.name } }));
    await send("settings.company", patch as Record<string, unknown>);
    return true;
  },
  async updateBranding(patch: Partial<OrgBranding>) {
    setState((db) => ({ ...db, org: { ...db.org, branding: { ...db.org.branding, ...patch } } }));
    await send("settings.branding", patch as Record<string, unknown>);
    return true;
  },
  async uploadLogo(file: File, variant: "light" | "dark" = "light") {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("variant", variant);
    const r = await apiFetch<{ url: string }>(`/api/orgs/${currentOrgId()}/logo`, { method: "POST", body: fd });
    setState((db) => ({ ...db, org: { ...db.org, [variant === "dark" ? "logoDarkUrl" : "logoUrl"]: r.url } }));
    window.dispatchEvent(new Event("deceler:companies-changed"));
    return r;
  },
  async removeLogo(variant: "light" | "dark" = "light") {
    await apiFetch(`/api/orgs/${currentOrgId()}/logo?variant=${variant}`, { method: "DELETE" });
    setState((db) => ({ ...db, org: { ...db.org, [variant === "dark" ? "logoDarkUrl" : "logoUrl"]: null } }));
    window.dispatchEvent(new Event("deceler:companies-changed"));
    return true;
  },
  async markOnboarding(step: string, done = true) {
    setState((db) => ({ ...db, org: { ...db.org, onboarding: { ...db.org.onboarding, [step]: done } } }));
    await send("settings.onboarding", { step, done });
  },
  async updateStages(stages: StageConfig[]) {
    setState((db) => ({ ...db, stages }));
    await send("settings.stages", { stages });
    return true;
  },
  async updateNotificationPrefs(patch: Partial<NotificationPrefs>) {
    setState((db) => ({ ...db, notificationPrefs: { ...db.notificationPrefs, ...patch } }));
    await send("settings.notificationPrefs", patch as Record<string, unknown>);
    return true;
  },
  saveTemplate(t: EmailTemplate) {
    return upsert("email_template", "emailTemplates", { ...t, updatedAt: now() });
  },
  deleteTemplate(id: ID) {
    return removeRecord("email_template", "emailTemplates", id);
  },
};

const team = {
  /** Creates an invitation. Returns the accept link (email delivery only if configured). */
  async invite(email: string, role: Role) {
    const r = await apiFetch<{ link: string; delivery: string }>(`/api/orgs/${currentOrgId()}/invitations`, { method: "POST", body: JSON.stringify({ email, role }) });
    await loadWorkspace(currentOrgId()!);
    return r;
  },
  async revokeInvite(id: string) {
    await apiFetch(`/api/orgs/${currentOrgId()}/invitations?id=${id}`, { method: "DELETE" });
    setState((db) => ({ ...db, invitations: db.invitations.filter((i) => i.id !== id) }));
  },
  async updateRole(userId: ID, role: Role) {
    setState((db) => ({ ...db, team: db.team.map((m) => (m.id === userId ? { ...m, role } : m)) }));
    await send("team.updateRole", { userId, role });
    return true;
  },
  async remove(userId: ID) {
    setState((db) => ({ ...db, team: db.team.filter((m) => m.id !== userId) }));
    await send("team.remove", { userId });
    return true;
  },
};

const notifications = {
  async markRead(id: ID) {
    const n = getState().notifications.find((x) => x.id === id);
    if (n && !n.read) await upsert("notification", "notifications", { ...n, read: true, userId: getState().currentUserId });
    return true;
  },
  async markAllRead() {
    for (const n of getState().notifications.filter((x) => !x.read)) await notifications.markRead(n.id);
    return true;
  },
};

/* ───────────────────── Quick Check & CV Builder ───────────────────── */
export type QuestionInput = Pick<AssessmentQuestion, "questionText" | "type" | "options" | "correctOptionId" | "explanation" | "competency" | "difficulty" | "recommendedTimeSeconds" | "language"> & { jobId?: ID | null };

const assessments = {
  async saveQuestion(id: ID | null, input: QuestionInput) {
    const qid = id ?? uid("aq");
    setState((db) => {
      const existing = db.assessmentQuestions.find((q) => q.id === qid);
      const q: AssessmentQuestion = existing
        ? { ...existing, ...input, jobId: input.jobId ?? existing.jobId, version: existing.version + 1, status: "draft", approvedAt: undefined, approvedBy: undefined, updatedAt: now() }
        : { ...input, jobId: input.jobId ?? undefined, id: qid, status: "draft", version: 1, source: "manual", createdAt: now(), updatedAt: now(), createdBy: db.currentUserId };
      return { ...db, assessmentQuestions: existing ? db.assessmentQuestions.map((x) => (x.id === qid ? q : x)) : [q, ...db.assessmentQuestions] };
    });
    await send("assessments.question.save", { id: qid, input });
    return qid;
  },
  async setStatus(id: ID, action: "approve" | "archive" | "restore") {
    const status = action === "approve" ? "approved" : action === "archive" ? "archived" : "draft";
    setState((db) => ({ ...db, assessmentQuestions: db.assessmentQuestions.map((q) => (q.id === id ? { ...q, status } : q)) }));
    await send(`assessments.question.${action}`, { id });
  },
  async removeQuestion(id: ID) {
    setState((db) => ({ ...db, assessmentQuestions: db.assessmentQuestions.filter((q) => q.id !== id) }));
    await send("assessments.question.delete", { id });
  },
  async saveJobConfig(jobId: ID, config: JobAssessmentConfig) {
    setState((db) => ({ ...db, jobAssessments: { ...db.jobAssessments, [jobId]: config } }));
    await send("assessments.job.save", { jobId, ...config });
  },
  /** Drafts questions with Claude from the job's own data. Returns how many were saved/rejected. */
  async generate(input: { jobId: ID; count: number; language: "en" | "el"; competencies: string; mix: "multiple_choice" | "mixed" }) {
    const r = await apiFetch<{ ids: string[]; rejected: { question: string; reason: string }[]; model: string }>(`/api/orgs/${currentOrgId()}/assessments/generate`, { method: "POST", body: JSON.stringify(input) });
    await loadWorkspace(currentOrgId()!);
    return r;
  },
  async invite(applicationId: ID, sendEmail = true) {
    const r = await apiFetch<{ url: string; emailDelivery: string }>(`/api/orgs/${currentOrgId()}/assessments/invite`, { method: "POST", body: JSON.stringify({ applicationId, sendEmail }) });
    await loadWorkspace(currentOrgId()!);
    return r;
  },
  async revoke(attemptId: string) {
    await send("assessments.attempt.revoke", { attemptId });
  },
  async saveNotes(attemptId: string, notes: string) {
    setState((db) => ({ ...db, assessmentAttempts: db.assessmentAttempts.map((a) => (a.id === attemptId ? { ...a, reviewerNotes: notes } : a)) }));
    await send("assessments.attempt.notes", { attemptId, notes });
  },
  async observe(attemptId: string) {
    await apiFetch(`/api/orgs/${currentOrgId()}/assessments/observe`, { method: "POST", body: JSON.stringify({ attemptId }) });
    await loadWorkspace(currentOrgId()!);
  },
  exportUrl: (jobId?: ID) => `/api/orgs/${currentOrgId()}/assessments/export${jobId ? `?jobId=${jobId}` : ""}`,
  async saveCvSettings(patch: Partial<Database["cvSettings"]>) {
    setState((db) => ({ ...db, cvSettings: { ...db.cvSettings, ...patch } }));
    const { platformTemplates: _p, ...rest } = patch;
    await send("settings.cvBuilder", rest);
  },
  async saveAiSettings(patch: Partial<Database["aiSettings"]>) {
    setState((db) => ({ ...db, aiSettings: { ...db.aiSettings, ...patch } }));
    await send("settings.ai", patch);
    await loadWorkspace(currentOrgId()!);
  },
};

/** Logs a drafted email on the timeline. Sending requires a configured email provider. */
async function logEmailDraft(candidateId: ID, subject: string) {
  await send("activity.log", { kind: "email_drafted", message: `drafted an email: “${subject}” (not sent - email delivery not configured)`, candidateId });
  return true;
}

export const api = { jobs, applications, candidates, notes, interviews, scorecards, tasks, talentLists, views, settings, team, notifications, assessments, logEmailDraft };
