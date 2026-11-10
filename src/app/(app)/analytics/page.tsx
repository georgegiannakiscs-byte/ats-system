"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Building, ChartColumn, Table2, Info, ArrowRight } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { usePageMeta } from "@/components/shell/page-meta";
import { Card, CardHeader } from "@/components/common/card";
import { Segmented } from "@/components/ui/controls";
import { FilterMenu } from "@/components/common/filter-menu";
import { DemoLabel } from "@/components/common/demo-label";
import { ColumnChart, TrendLine } from "@/components/charts/chart-kit";
import { bySource, funnel, RANGE_LABEL, scopedApps, timeToHireSeries, weeklyApplications, type Range } from "@/lib/analytics";
import { DEPARTMENTS, STAGE_ORDER } from "@/lib/constants";
import { daysSince } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const db = useDb();
  const router = useRouter();
  usePageMeta("Analytics");
  const [range, setRange] = React.useState<Range>("90d");
  const [depts, setDepts] = React.useState<string[]>([]);
  const [jobIds, setJobIds] = React.useState<string[]>([]);
  const [weeklyView, setWeeklyView] = React.useState<"chart" | "table">("chart");
  const [tthView, setTthView] = React.useState<"chart" | "table">("chart");

  const apps = React.useMemo(() => scopedApps(db, range, jobIds, depts), [db, range, jobIds, depts]);
  const f = funnel(db, apps);
  const sources = bySource(db, apps);
  const weeks = weeklyApplications(db, range === "30d" ? 5 : 12, apps);
  const tth = timeToHireSeries(db);
  const hires = apps.filter((a) => a.status === "hired").length;
  const offersReached = f[6].reached;
  const interviewsReached = f[2].reached;
  const avgTth = tth.at(-1)!.days;
  const prevTth = tth.at(-2)!.days;

  const kpis = [
    { label: "Applications", value: apps.length, sub: RANGE_LABEL[range] },
    { label: "Reached interview", value: `${apps.length ? Math.round((interviewsReached / apps.length) * 100) : 0}%`, sub: `${interviewsReached} candidates` },
    { label: "Interview → offer", value: `${interviewsReached ? Math.round((offersReached / interviewsReached) * 100) : 0}%`, sub: `${offersReached} offers` },
    { label: "Hires", value: hires, sub: hires ? "Offer stage → Hired" : "None in range" },
    { label: "Time to hire", value: `${avgTth}d`, sub: `${avgTth <= prevTth ? "▼" : "▲"} ${Math.abs(avgTth - prevTth)}d vs last month`, good: avgTth <= prevTth },
  ];

  const jobsInScope = db.jobs.filter((j) => (!depts.length || depts.includes(j.department)) && (!jobIds.length || jobIds.includes(j.id)) && j.status !== "draft");

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented ariaLabel="Date range" value={range} onChange={setRange} options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ value: r, label: { "30d": "30 days", "90d": "90 days", "12m": "12 months", all: "All time" }[r] }))} />
        <FilterMenu label="Department" icon={<Building />} options={DEPARTMENTS.filter((d) => db.jobs.some((j) => j.department === d)).map((d) => ({ value: d, label: d }))} selected={depts} onChange={setDepts} />
        <FilterMenu label="Job" icon={<BriefcaseBusiness />} searchable options={db.jobs.map((j) => ({ value: j.id, label: j.title }))} selected={jobIds} onChange={setJobIds} />
        <span className="ml-auto"><DemoLabel>Computed from demo data</DemoLabel></span>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Key metrics">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-3.5 shadow-xs">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="tabular mt-2 text-[26px] font-semibold leading-none tracking-tight">{k.value}</p>
            <p className={cn("mt-2 text-xs", k.good === undefined ? "text-muted-foreground" : k.good ? "text-success" : "text-warning")}>{k.sub}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Recruitment funnel" description="Candidates who reached each stage, with stage-to-stage conversion" />
          <div className="px-4 pb-4">
            <ol className="space-y-1.5">
              {f.map((s, i) => {
                const pct = f[0].reached ? (s.reached / f[0].reached) * 100 : 0;
                const conv = i > 0 && f[i - 1].reached ? Math.round((s.reached / f[i - 1].reached) * 100) : null;
                return (
                  <li key={s.stage}>
                    <button onClick={() => router.push(`/candidates?stage=${s.stage}`)} className="group grid w-full grid-cols-[140px_1fr_48px_56px] items-center gap-3 rounded-md px-1 py-1 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="truncate text-foreground/85">{s.label}</span>
                      <span className="relative h-6 overflow-hidden rounded-[5px] bg-muted/60">
                        <span className="absolute inset-y-0 left-0 rounded-[5px] transition-[width] duration-500" style={{ width: `${Math.max(pct, 1.5)}%`, background: `color-mix(in oklch, var(--chart-1) ${100 - i * 9}%, var(--surface))` }} />
                      </span>
                      <span className="tabular text-right font-medium">{s.reached}</span>
                      <span className="tabular text-right text-xs text-muted-foreground">{conv === null ? "—" : `${conv}%`}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Right column: conversion from the previous stage. Includes rejected candidates at the stage they reached.</p>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Applications by source" description="Volume and share that progressed to interviews" />
          <div className="px-4 pb-4">
            <div className="grid grid-cols-[1fr_48px_64px] gap-2 px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground"><span>Source</span><span className="text-right">Apps</span><span className="text-right">→ Intv.</span></div>
            <ul className="space-y-1">
              {sources.map((s) => {
                const max = Math.max(1, ...sources.map((x) => x.applications));
                return (
                  <li key={s.source}>
                    <Link href={`/candidates?source=${encodeURIComponent(s.source)}`} className="relative grid h-8 grid-cols-[1fr_48px_64px] items-center gap-2 rounded-md px-1 text-sm hover:bg-accent">
                      <span className="relative z-10 truncate pl-1">{s.source}</span>
                      <span className="tabular relative z-10 text-right font-medium">{s.applications}</span>
                      <span className="tabular relative z-10 text-right text-xs text-muted-foreground">{s.applications ? `${s.rate}%` : "—"}</span>
                      <span className="absolute inset-y-1 left-0 rounded-[5px] bg-[color-mix(in_oklch,var(--chart-1)_14%,transparent)]" style={{ width: `${(s.applications / max) * 70}%` }} aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Applications over time" description="New applications per week" action={<Segmented ariaLabel="Display" value={weeklyView} onChange={setWeeklyView} options={[{ value: "chart", icon: <ChartColumn />, title: "Chart" }, { value: "table", icon: <Table2 />, title: "Table" }]} />} />
          <div className="px-3 pb-3">
            {weeklyView === "chart" ? <ColumnChart data={weeks} x="week" y="applications" name="Applications" height={240} /> : <DataTable rows={weeks.map((w) => [`Week of ${w.week}`, String(w.applications)])} head={["Week", "Applications"]} />}
          </div>
        </Card>
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2">Time to hire <DemoLabel>Includes historical demo series</DemoLabel></span>} description="Average days from application to accepted offer" action={<Segmented ariaLabel="Display" value={tthView} onChange={setTthView} options={[{ value: "chart", icon: <ChartColumn />, title: "Chart" }, { value: "table", icon: <Table2 />, title: "Table" }]} />} />
          <div className="px-3 pb-3">
            {tthView === "chart" ? <TrendLine data={tth} x="month" series={[{ key: "days", name: "Days to hire" }]} unit="d" height={240} area /> : <DataTable rows={tth.map((t) => [t.month, `${t.days} days`])} head={["Month", "Avg. time to hire"]} />}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Stage health" description="Conversion and average time in each stage" />
          <div className="px-4 pb-4">
            <table className="w-full text-sm">
              <thead className="text-[11px] font-medium uppercase tracking-wider text-subtle-foreground"><tr><th className="pb-2 text-left font-medium">Stage</th><th className="pb-2 text-right font-medium">Now</th><th className="pb-2 text-right font-medium">Avg. days</th><th className="pb-2 text-right font-medium">Target</th></tr></thead>
              <tbody className="divide-y divide-border">
                {STAGE_ORDER.slice(0, 7).map((s) => {
                  const cfg = db.stages.find((x) => x.id === s)!;
                  const inStage = apps.filter((a) => a.stage === s && a.status === "active");
                  const avg = inStage.length ? Math.round(inStage.reduce((n, a) => n + daysSince(a.stageEnteredAt), 0) / inStage.length) : 0;
                  const over = cfg.slaDays && avg > cfg.slaDays;
                  return (
                    <tr key={s}>
                      <td className="py-2">{cfg.label}</td>
                      <td className="tabular py-2 text-right">{inStage.length}</td>
                      <td className={cn("tabular py-2 text-right", over ? "font-medium text-warning" : "")}>{inStage.length ? `${avg}d` : "—"}</td>
                      <td className="tabular py-2 text-right text-muted-foreground">{cfg.slaDays}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Job performance" description="How each role is progressing" />
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">
                <tr><th className="pb-2 text-left font-medium">Job</th><th className="pb-2 text-right font-medium">Applicants</th><th className="pb-2 text-right font-medium">Interviewing</th><th className="pb-2 text-right font-medium">Offers</th><th className="pb-2 text-right font-medium">Hired</th><th className="pb-2 text-right font-medium">Pass-through</th><th className="pb-2 text-right font-medium">Days open</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobsInScope.map((j) => {
                  const ja = apps.filter((a) => a.jobId === j.id);
                  const intv = ja.filter((a) => STAGE_ORDER.indexOf(a.stage) >= 2).length;
                  const offers = ja.filter((a) => STAGE_ORDER.indexOf(a.stage) >= 6).length;
                  const hired = ja.filter((a) => a.status === "hired").length;
                  return (
                    <tr key={j.id} className="group">
                      <td className="py-2"><Link href={`/jobs/view?id=${j.id}`} className="inline-flex items-center gap-1 font-medium hover:underline">{j.title}<ArrowRight className="size-3 opacity-0 group-hover:opacity-60" /></Link><span className="block text-xs text-muted-foreground">{j.department}</span></td>
                      <td className="tabular py-2 text-right">{ja.length}</td>
                      <td className="tabular py-2 text-right">{intv}</td>
                      <td className="tabular py-2 text-right">{offers}</td>
                      <td className="tabular py-2 text-right">{hired}/{j.openings}</td>
                      <td className="tabular py-2 text-right">{ja.length ? `${Math.round((intv / ja.length) * 100)}%` : "—"}</td>
                      <td className="tabular py-2 text-right text-muted-foreground">{j.publishedAt ? daysSince(j.publishedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {jobsInScope.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No jobs in this selection.</p>}
          </div>
        </Card>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-subtle-foreground"><Info className="size-3.5" />Analytics are computed in your browser from the demo dataset and update as you move candidates.</p>
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="max-h-[240px] overflow-y-auto px-1 scrollbar-thin">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wider text-subtle-foreground"><tr>{head.map((h, i) => <th key={h} className={cn("pb-2 font-medium", i ? "text-right" : "text-left")}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={cn("tabular py-1.5", i ? "text-right" : "")}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
