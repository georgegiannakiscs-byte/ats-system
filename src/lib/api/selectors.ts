import type { Application, Candidate, Database, ID, Interview, Job, StageId, TeamMember } from "@/lib/types";
import { STAGE_ORDER } from "@/lib/constants";

export const fullName = (c: Pick<Candidate, "firstName" | "lastName">) => `${c.firstName} ${c.lastName}`;

export function indexDb(db: Database) {
  const jobs = new Map<ID, Job>(db.jobs.map((j) => [j.id, j]));
  const candidates = new Map<ID, Candidate>(db.candidates.map((c) => [c.id, c]));
  const team = new Map<ID, TeamMember>(db.team.map((m) => [m.id, m]));
  return { jobs, candidates, team };
}

export function stageIndex(stage: StageId) {
  return STAGE_ORDER.indexOf(stage);
}

export function applicationsFor(db: Database, candidateId: ID) {
  return db.applications.filter((a) => a.candidateId === candidateId).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
}

/** The application that best represents a candidate's current status. */
export function primaryApplication(db: Database, candidateId: ID): Application | undefined {
  const apps = applicationsFor(db, candidateId);
  return apps.find((a) => a.status === "active") ?? apps.find((a) => a.status === "hired") ?? apps[0];
}

export function jobCounts(db: Database, jobId: ID) {
  const apps = db.applications.filter((a) => a.jobId === jobId);
  const active = apps.filter((a) => a.status === "active");
  const newThisWeek = apps.filter((a) => Date.now() - new Date(a.appliedAt).getTime() < 7 * 864e5).length;
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, apps.filter((a) => a.stage === s && a.status !== "rejected").length])) as Record<StageId, number>;
  return { total: apps.length, active: active.length, hired: apps.filter((a) => a.status === "hired").length, newThisWeek, byStage };
}

export function interviewFeedback(db: Database, i: Interview): "submitted" | "partial" | "pending" | "n/a" {
  if (i.status === "cancelled") return "n/a";
  if (i.status === "scheduled" && new Date(i.start) > new Date()) return "n/a";
  const cards = db.scorecards.filter((s) => s.interviewId === i.id);
  if (cards.length === 0) return "pending";
  return cards.length >= i.interviewerIds.length ? "submitted" : "partial";
}

export function upcomingInterviews(db: Database) {
  const now = Date.now();
  return db.interviews.filter((i) => i.status === "scheduled" && new Date(i.start).getTime() + i.durationMin * 60000 > now).sort((a, b) => a.start.localeCompare(b.start));
}

export function pendingEvaluations(db: Database) {
  return db.interviews.filter((i) => interviewFeedback(db, i) === "pending" || interviewFeedback(db, i) === "partial");
}

export function averageScore(db: Database, candidateId: ID) {
  const cards = db.scorecards.filter((s) => s.candidateId === candidateId);
  if (!cards.length) return null;
  const scores = cards.flatMap((c) => c.criteria.map((x) => x.score).filter(Boolean));
  return scores.reduce((s, n) => s + n, 0) / Math.max(1, scores.length);
}
