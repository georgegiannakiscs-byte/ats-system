import { startOfWeek, format, subWeeks, isAfter, subDays } from "date-fns";
import type { Database, ID, Source, StageId } from "@/lib/types";
import { SOURCES, STAGE_ORDER } from "@/lib/constants";

export type Range = "30d" | "90d" | "12m" | "all";
export const RANGE_LABEL: Record<Range, string> = { "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months", all: "All time" };

export function rangeStart(range: Range) {
  const now = new Date();
  return range === "30d" ? subDays(now, 30) : range === "90d" ? subDays(now, 90) : range === "12m" ? subDays(now, 365) : new Date(0);
}

export function scopedApps(db: Database, range: Range, jobIds: ID[] = [], departments: string[] = []) {
  const start = rangeStart(range);
  return db.applications.filter((a) => {
    if (!isAfter(new Date(a.appliedAt), start)) return false;
    if (jobIds.length && !jobIds.includes(a.jobId)) return false;
    if (departments.length) {
      const j = db.jobs.find((x) => x.id === a.jobId);
      if (!j || !departments.includes(j.department)) return false;
    }
    return true;
  });
}

export function weeklyApplications(db: Database, weeks = 8, apps = db.applications) {
  const now = new Date();
  return Array.from({ length: weeks }, (_, i) => {
    const ws = startOfWeek(subWeeks(now, weeks - 1 - i), { weekStartsOn: 1 });
    const we = startOfWeek(subWeeks(now, weeks - 2 - i), { weekStartsOn: 1 });
    return { week: format(ws, "d MMM"), applications: apps.filter((a) => new Date(a.appliedAt) >= ws && new Date(a.appliedAt) < we).length };
  });
}

/** Funnel: how many applications reached at least each stage. */
export function funnel(db: Database, apps = db.applications) {
  return STAGE_ORDER.map((s, idx) => ({ stage: s as StageId, label: db.stages.find((x) => x.id === s)!.label, reached: apps.filter((a) => STAGE_ORDER.indexOf(a.stage) >= idx).length }));
}

export function bySource(db: Database, apps = db.applications) {
  const cand = new Map(db.candidates.map((c) => [c.id, c]));
  return SOURCES.map((s: Source) => {
    const list = apps.filter((a) => cand.get(a.candidateId)?.source === s);
    const progressed = list.filter((a) => STAGE_ORDER.indexOf(a.stage) >= 2).length;
    return { source: s, applications: list.length, progressed, rate: list.length ? Math.round((progressed / list.length) * 100) : 0 };
  }).sort((a, b) => b.applications - a.applications);
}

/** Average days from application to hire, per month of hire, from real hired applications. */
export function timeToHireSeries(db: Database, apps = db.applications) {
  const now = new Date();
  const hires = apps.filter((a) => a.status === "hired");
  return Array.from({ length: 12 }, (_, i) => {
    const m = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const inMonth = hires.filter((a) => new Date(a.stageEnteredAt) >= m && new Date(a.stageEnteredAt) < next);
    const days = inMonth.length ? Math.round(inMonth.reduce((s, a) => s + (new Date(a.stageEnteredAt).getTime() - new Date(a.appliedAt).getTime()) / 864e5, 0) / inMonth.length) : null;
    return { month: format(m, "MMM"), days: days ?? 0, hires: inMonth.length };
  });
}
