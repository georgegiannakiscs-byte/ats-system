"use client";
/**
 * MOCK API — the only module the UI calls to change data.
 *
 * Every method is async and returns the updated entity so that it can be
 * swapped for `fetch('/api/...')` calls without touching components.
 * Today, changes apply instantly (optimistic) and persist to localStorage.
 */
import type {
  Activity,
  ActivityKind,
  Application,
  Candidate,
  CompanyProfile,
  Database,
  EmailTemplate,
  ID,
  IntegrationId,
  IntegrationState,
  Interview,
  Job,
  JobStatus,
  Note,
  NotificationPrefs,
  Role,
  SavedView,
  Scorecard,
  StageConfig,
  StageId,
  Task,
  TalentList,
  TeamMember,
} from "@/lib/types";
import { getState, resetState, setState } from "./store";
import { uid } from "@/lib/utils";

const now = () => new Date().toISOString();
const ok = <T,>(value: T) => Promise.resolve(value);

function activity(db: Database, kind: ActivityKind, message: string, refs: { candidateId?: ID; jobId?: ID } = {}): Database {
  const a: Activity = { id: uid("act"), kind, actorId: db.currentUserId, message, createdAt: now(), ...refs };
  return { ...db, activities: [a, ...db.activities].slice(0, 600) };
}

function stageLabel(db: Database, id: StageId) {
  return db.stages.find((s) => s.id === id)?.label ?? id;
}

/* ───────────────────────── Jobs ───────────────────────── */
export type JobInput = Omit<Job, "id" | "createdAt" | "publishedAt">;

const jobs = {
  create(input: JobInput) {
    const job: Job = { ...input, id: uid("j"), createdAt: now(), publishedAt: input.status === "published" ? now() : undefined };
    setState((db) => activity({ ...db, jobs: [job, ...db.jobs] }, "job_created", `created the job ${job.title}`, { jobId: job.id }));
    return ok(job);
  },
  update(id: ID, patch: Partial<Job>) {
    let updated!: Job;
    setState((db) => {
      const jobsNext = db.jobs.map((j) => {
        if (j.id !== id) return j;
        updated = { ...j, ...patch };
        if (patch.status === "published" && !j.publishedAt) updated.publishedAt = now();
        return updated;
      });
      return activity({ ...db, jobs: jobsNext }, "job_updated", `updated ${updated.title}`, { jobId: id });
    });
    return ok(updated);
  },
  setStatus(id: ID, status: JobStatus) {
    return jobs.update(id, { status });
  },
  duplicate(id: ID) {
    const src = getState().jobs.find((j) => j.id === id);
    if (!src) return Promise.reject(new Error("Job not found"));
    const { id: _id, createdAt: _c, publishedAt: _p, ...rest } = src;
    return jobs.create({ ...rest, title: `${src.title} (copy)`, status: "draft" });
  },
  remove(id: ID) {
    setState((db) => ({
      ...db,
      jobs: db.jobs.filter((j) => j.id !== id),
      applications: db.applications.filter((a) => a.jobId !== id),
      interviews: db.interviews.filter((i) => i.jobId !== id),
    }));
    return ok(true);
  },
};

/* ────────────────────── Applications ───────────────────── */
const applications = {
  /** Move a candidate to a stage, optionally at a specific index within the column. */
  move(id: ID, stage: StageId, index?: number) {
    let moved!: Application;
    setState((db) => {
      const app = db.applications.find((a) => a.id === id);
      if (!app) return db;
      const stageChanged = app.stage !== stage;
      moved = { ...app, stage, status: stage === "hired" ? "hired" : "active", stageEnteredAt: stageChanged ? now() : app.stageEnteredAt, evaluation: stageChanged && app.evaluation === "none" ? "pending" : app.evaluation };
      // Re-order the destination column
      const column = db.applications
        .filter((a) => a.jobId === app.jobId && a.stage === stage && a.id !== id && a.status !== "rejected")
        .sort((a, b) => a.order - b.order);
      column.splice(index ?? column.length, 0, moved);
      const orderMap = new Map(column.map((a, i) => [a.id, i]));
      let next: Database = {
        ...db,
        applications: db.applications.map((a) => (a.id === id ? { ...moved, order: orderMap.get(id)! } : orderMap.has(a.id) ? { ...a, order: orderMap.get(a.id)! } : a)),
      };
      if (stageChanged) {
        const c = db.candidates.find((x) => x.id === app.candidateId);
        const job = db.jobs.find((j) => j.id === app.jobId);
        next = activity(next, stage === "hired" ? "hired" : "stage_changed", stage === "hired" ? `marked ${c?.firstName} ${c?.lastName} as hired for ${job?.title}` : `moved ${c?.firstName} ${c?.lastName} to ${stageLabel(db, stage)}`, { candidateId: app.candidateId, jobId: app.jobId });
      }
      return next;
    });
    return ok(moved);
  },
  reject(id: ID, reason: string, addToPool: boolean) {
    setState((db) => {
      const app = db.applications.find((a) => a.id === id)!;
      const c = db.candidates.find((x) => x.id === app.candidateId)!;
      const next = {
        ...db,
        applications: db.applications.map((a) => (a.id === id ? { ...a, status: "rejected" as const, rejectionReason: reason, stageEnteredAt: now() } : a)),
        candidates: addToPool ? db.candidates.map((x) => (x.id === c.id ? { ...x, inTalentPool: true } : x)) : db.candidates,
      };
      return activity(next, "rejected", `rejected ${c.firstName} ${c.lastName} — ${reason}`, { candidateId: c.id, jobId: app.jobId });
    });
    return ok(true);
  },
  restore(id: ID) {
    setState((db) => ({ ...db, applications: db.applications.map((a) => (a.id === id ? { ...a, status: "active", rejectionReason: undefined } : a)) }));
    return ok(true);
  },
  hire(id: ID) {
    return applications.move(id, "hired");
  },
  setRecruiter(id: ID, recruiterId: ID) {
    setState((db) => ({ ...db, applications: db.applications.map((a) => (a.id === id ? { ...a, recruiterId } : a)) }));
    return ok(true);
  },
  /** Add an existing candidate (e.g. from the talent pool) to a job. */
  create(candidateId: ID, jobId: ID) {
    const db = getState();
    const existing = db.applications.find((a) => a.candidateId === candidateId && a.jobId === jobId && a.status === "active");
    if (existing) return Promise.reject(new Error("Candidate is already in this job's pipeline"));
    const app: Application = { id: uid("a"), candidateId, jobId, stage: "applied", status: "active", appliedAt: now(), stageEnteredAt: now(), recruiterId: db.jobs.find((j) => j.id === jobId)?.recruiterId ?? db.currentUserId, evaluation: "none", order: -1 };
    setState((s) => {
      const c = s.candidates.find((x) => x.id === candidateId)!;
      const job = s.jobs.find((j) => j.id === jobId)!;
      return activity({ ...s, applications: [...s.applications, app] }, "applied", `added ${c.firstName} ${c.lastName} to ${job.title}`, { candidateId, jobId });
    });
    return ok(app);
  },
};

/* ─────────────────────── Candidates ────────────────────── */
export type CandidateInput = Pick<Candidate, "firstName" | "lastName" | "email" | "phone" | "location" | "headline" | "currentCompany" | "linkedinUrl" | "source" | "tags" | "skills">;

const candidates = {
  create(input: CandidateInput, jobId?: ID) {
    const c: Candidate = {
      ...input,
      id: uid("c"),
      experience: input.headline ? [{ title: input.headline, company: input.currentCompany || "—", start: String(new Date().getFullYear() - 2) }] : [],
      education: [],
      summary: "",
      languages: ["English"],
      hue: Math.floor(Math.random() * 360),
      createdAt: now(),
      inTalentPool: !jobId,
    };
    setState((db) => activity({ ...db, candidates: [c, ...db.candidates] }, "candidate_updated", `added ${c.firstName} ${c.lastName}`, { candidateId: c.id }));
    if (jobId) applications.create(c.id, jobId);
    return ok(c);
  },
  update(id: ID, patch: Partial<Candidate>) {
    let updated!: Candidate;
    setState((db) => {
      const next = db.candidates.map((c) => (c.id === id ? (updated = { ...c, ...patch }) : c));
      return activity({ ...db, candidates: next }, "candidate_updated", `updated ${updated.firstName} ${updated.lastName}'s profile`, { candidateId: id });
    });
    return ok(updated);
  },
  setTalentPool(ids: ID[], inPool: boolean) {
    setState((db) => ({ ...db, candidates: db.candidates.map((c) => (ids.includes(c.id) ? { ...c, inTalentPool: inPool } : c)) }));
    return ok(true);
  },
  addTags(ids: ID[], tags: string[]) {
    setState((db) => ({ ...db, candidates: db.candidates.map((c) => (ids.includes(c.id) ? { ...c, tags: Array.from(new Set([...c.tags, ...tags])) } : c)) }));
    return ok(true);
  },
};

/* ───────────────────────── Notes ───────────────────────── */
const notes = {
  add(candidateId: ID, body: string) {
    const note: Note = { id: uid("n"), candidateId, authorId: getState().currentUserId, body, createdAt: now() };
    setState((db) => activity({ ...db, notes: [note, ...db.notes] }, "note_added", "added a note", { candidateId }));
    return ok(note);
  },
  update(id: ID, patch: Partial<Note>) {
    setState((db) => ({ ...db, notes: db.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
    return ok(true);
  },
  remove(id: ID) {
    setState((db) => ({ ...db, notes: db.notes.filter((n) => n.id !== id) }));
    return ok(true);
  },
};

/* ─────────────────────── Interviews ────────────────────── */
export type InterviewInput = Omit<Interview, "id" | "createdAt" | "status">;

const interviews = {
  schedule(input: InterviewInput) {
    const interview: Interview = { ...input, id: uid("i"), status: "scheduled", createdAt: now() };
    setState((db) => {
      const c = db.candidates.find((x) => x.id === input.candidateId);
      return activity({ ...db, interviews: [...db.interviews, interview] }, "interview_scheduled", `scheduled a ${input.kind.toLowerCase()} with ${c?.firstName} ${c?.lastName}`, { candidateId: input.candidateId, jobId: input.jobId });
    });
    return ok(interview);
  },
  update(id: ID, patch: Partial<Interview>) {
    setState((db) => ({ ...db, interviews: db.interviews.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    return ok(true);
  },
  cancel(id: ID) {
    return interviews.update(id, { status: "cancelled" });
  },
};

/* ─────────────────────── Scorecards ────────────────────── */
const scorecards = {
  submit(input: Omit<Scorecard, "id" | "submittedAt" | "authorId">) {
    const db0 = getState();
    const card: Scorecard = { ...input, id: uid("s"), authorId: db0.currentUserId, submittedAt: now() };
    setState((db) => {
      let next: Database = { ...db, scorecards: [card, ...db.scorecards] };
      if (input.interviewId) next.interviews = next.interviews.map((i) => (i.id === input.interviewId && i.status === "scheduled" ? { ...i, status: "completed" } : i));
      const evaluation = input.recommendation === "strong_yes" || input.recommendation === "yes" ? "positive" : "negative";
      next.applications = next.applications.map((a) => (a.candidateId === input.candidateId && a.jobId === input.jobId ? { ...a, evaluation: a.evaluation === "positive" && evaluation === "negative" ? "mixed" : evaluation } : a));
      const c = db.candidates.find((x) => x.id === input.candidateId);
      next = activity(next, "scorecard_submitted", `submitted a scorecard for ${c?.firstName} ${c?.lastName}`, { candidateId: input.candidateId, jobId: input.jobId });
      return next;
    });
    return ok(card);
  },
};

/* ───────────────────────── Tasks ───────────────────────── */
export type TaskInput = Omit<Task, "id" | "createdAt" | "done" | "completedAt">;

const tasks = {
  create(input: TaskInput) {
    const task: Task = { ...input, id: uid("t"), createdAt: now(), done: false };
    setState((db) => ({ ...db, tasks: [task, ...db.tasks] }));
    return ok(task);
  },
  update(id: ID, patch: Partial<Task>) {
    setState((db) => ({ ...db, tasks: db.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    return ok(true);
  },
  toggle(id: ID) {
    setState((db) => {
      const t = db.tasks.find((x) => x.id === id)!;
      const done = !t.done;
      const next = { ...db, tasks: db.tasks.map((x) => (x.id === id ? { ...x, done, completedAt: done ? now() : undefined } : x)) };
      return done ? activity(next, "task_completed", `completed “${t.title}”`, { candidateId: t.candidateId, jobId: t.jobId }) : next;
    });
    return ok(true);
  },
  remove(id: ID) {
    setState((db) => ({ ...db, tasks: db.tasks.filter((t) => t.id !== id) }));
    return ok(true);
  },
};

/* ────────────────────── Talent lists ───────────────────── */
const talentLists = {
  create(name: string, description?: string, candidateIds: ID[] = []) {
    const list: TalentList = { id: uid("l"), name, description, candidateIds, createdAt: now() };
    setState((db) => ({ ...db, talentLists: [...db.talentLists, list] }));
    return ok(list);
  },
  addCandidates(listId: ID, ids: ID[]) {
    setState((db) => ({
      ...db,
      talentLists: db.talentLists.map((l) => (l.id === listId ? { ...l, candidateIds: Array.from(new Set([...l.candidateIds, ...ids])) } : l)),
      candidates: db.candidates.map((c) => (ids.includes(c.id) ? { ...c, inTalentPool: true } : c)),
    }));
    return ok(true);
  },
  removeCandidate(listId: ID, id: ID) {
    setState((db) => ({ ...db, talentLists: db.talentLists.map((l) => (l.id === listId ? { ...l, candidateIds: l.candidateIds.filter((x) => x !== id) } : l)) }));
    return ok(true);
  },
  remove(listId: ID) {
    setState((db) => ({ ...db, talentLists: db.talentLists.filter((l) => l.id !== listId) }));
    return ok(true);
  },
};

/* ────────────────────── Saved views ────────────────────── */
const views = {
  save(view: Omit<SavedView, "id">) {
    const v: SavedView = { ...view, id: uid("v") };
    setState((db) => ({ ...db, savedViews: [...db.savedViews, v] }));
    return ok(v);
  },
  update(id: ID, patch: Partial<SavedView>) {
    setState((db) => ({ ...db, savedViews: db.savedViews.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
    return ok(true);
  },
  remove(id: ID) {
    setState((db) => ({ ...db, savedViews: db.savedViews.filter((v) => v.id !== id) }));
    return ok(true);
  },
};

/* ──────────────────── Settings & team ──────────────────── */
const settings = {
  updateCompany(patch: Partial<CompanyProfile>) {
    setState((db) => ({ ...db, company: { ...db.company, ...patch } }));
    return ok(true);
  },
  updateStages(stages: StageConfig[]) {
    setState((db) => ({ ...db, stages }));
    return ok(true);
  },
  setIntegration(id: IntegrationId, value: IntegrationState) {
    setState((db) => ({ ...db, integrations: { ...db.integrations, [id]: value } }));
    return ok(true);
  },
  updateNotificationPrefs(patch: Partial<NotificationPrefs>) {
    setState((db) => ({ ...db, notificationPrefs: { ...db.notificationPrefs, ...patch } }));
    return ok(true);
  },
  saveTemplate(t: EmailTemplate) {
    setState((db) => {
      const exists = db.emailTemplates.some((x) => x.id === t.id);
      return { ...db, emailTemplates: exists ? db.emailTemplates.map((x) => (x.id === t.id ? { ...t, updatedAt: now() } : x)) : [...db.emailTemplates, { ...t, updatedAt: now() }] };
    });
    return ok(true);
  },
  deleteTemplate(id: ID) {
    setState((db) => ({ ...db, emailTemplates: db.emailTemplates.filter((t) => t.id !== id) }));
    return ok(true);
  },
  resetDemo() {
    resetState();
    return ok(true);
  },
};

const team = {
  invite(name: string, email: string, role: Role) {
    const m: TeamMember = { id: uid("u"), name, email, role, title: role, department: "—", hue: Math.floor(Math.random() * 360), status: "invited" };
    setState((db) => ({ ...db, team: [...db.team, m] }));
    return ok(m);
  },
  updateRole(id: ID, role: Role) {
    setState((db) => ({ ...db, team: db.team.map((m) => (m.id === id ? { ...m, role } : m)) }));
    return ok(true);
  },
  remove(id: ID) {
    setState((db) => ({ ...db, team: db.team.filter((m) => m.id !== id) }));
    return ok(true);
  },
};

const notifications = {
  markRead(id: ID) {
    setState((db) => ({ ...db, notifications: db.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
    return ok(true);
  },
  markAllRead() {
    setState((db) => ({ ...db, notifications: db.notifications.map((n) => ({ ...n, read: true })) }));
    return ok(true);
  },
};

/** Records that an email was drafted. No email is sent — there is no mail backend. */
function logEmailDraft(candidateId: ID, subject: string) {
  setState((db) => activity(db, "email_drafted", `drafted an email: “${subject}” (demo — not sent)`, { candidateId }));
  return ok(true);
}

export const api = { jobs, applications, candidates, notes, interviews, scorecards, tasks, talentLists, views, settings, team, notifications, logEmailDraft };
