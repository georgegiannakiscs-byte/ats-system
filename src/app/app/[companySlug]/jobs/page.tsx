"use client";
import { orgPath } from "@/lib/org-path";
import { BRAND } from "@/config/brand";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BriefcaseBusiness, LayoutGrid, Plus, Rows3, Building, MapPin, ArrowUpDown } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { usePageMeta } from "@/components/shell/page-meta";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { SearchInput } from "@/components/common/search-input";
import { FilterMenu } from "@/components/common/filter-menu";
import { JobStatusBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { Person } from "@/components/common/person";
import { JobActionsMenu } from "@/components/jobs/job-actions";
import { jobCounts } from "@/lib/api/selectors";
import { DEPARTMENTS, STAGE_ORDER, STAGE_TONE } from "@/lib/constants";
import type { Job, JobStatus } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";

const VIEW_KEY = `${BRAND.slug}.ui.jobs-view`;
type StatusTab = "all" | JobStatus;

export default function JobsPage() {
  return (
    <React.Suspense>
      <Jobs />
    </React.Suspense>
  );
}

function Jobs() {
  const db = useDb();
  const router = useRouter();
  const sp = useSearchParams();
  usePageMeta("Jobs");
  const [q, setQ] = React.useState("");
  const [depts, setDepts] = React.useState<string[]>(sp.get("department") ? [sp.get("department")!] : []);
  const [status, setStatusTab] = React.useState<StatusTab>((sp.get("status") as StatusTab) ?? "all");
  const [view, setView] = React.useState<"list" | "grid">("list");
  const [sort, setSort] = React.useState<{ key: "title" | "applicants" | "published"; dir: 1 | -1 }>({ key: "published", dir: -1 });

  React.useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "list") setView(v);
    } catch {}
  }, []);

  const setStatus = (s: StatusTab) => {
    setStatusTab(s);
    router.replace(s === "all" ? orgPath("/jobs") : orgPath(`/jobs?status=${s}`), { scroll: false });
  };

  const counts = React.useMemo(() => new Map(db.jobs.map((j) => [j.id, jobCounts(db, j.id)])), [db]);
  const query = q.toLowerCase().trim();
  const jobs = db.jobs
    .filter((j) => (status === "all" || j.status === status) && (!depts.length || depts.includes(j.department)) && (!query || `${j.title} ${j.department} ${j.location}`.toLowerCase().includes(query)))
    .sort((a, b) => {
      const v = sort.key === "title" ? a.title.localeCompare(b.title) : sort.key === "applicants" ? counts.get(a.id)!.total - counts.get(b.id)!.total : (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt);
      return v * sort.dir;
    });
  const tabCount = (s: StatusTab) => db.jobs.filter((j) => s === "all" || j.status === s).length;
  const toggleSort = (key: typeof sort.key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "title" ? 1 : -1 }));

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <Tabs value={status} onValueChange={(v) => setStatus(v as StatusTab)}>
        <TabsList>
          {(["all", "published", "draft", "on_hold", "closed"] as const).map((s) => (
            <TabsTrigger key={s} value={s} count={tabCount(s)}>{{ all: "All jobs", published: "Published", draft: "Drafts", on_hold: "On hold", closed: "Closed" }[s]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 py-4">
        <SearchInput value={q} onChange={setQ} placeholder="Search jobs" />
        <FilterMenu label="Department" icon={<Building />} options={DEPARTMENTS.filter((d) => db.jobs.some((j) => j.department === d)).map((d) => ({ value: d, label: d, count: db.jobs.filter((j) => j.department === d).length }))} selected={depts} onChange={setDepts} />
        <div className="ml-auto flex items-center gap-2">
          <Segmented ariaLabel="Layout" value={view} onChange={(v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch {} }} options={[{ value: "list", icon: <Rows3 />, title: "List view" }, { value: "grid", icon: <LayoutGrid />, title: "Grid view" }]} />
          <Button asChild><Link href={orgPath("/jobs/new")}><Plus />Create job</Link></Button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={<BriefcaseBusiness />}
          title={db.jobs.length ? "No jobs match your filters" : "Create your first job"}
          description={db.jobs.length ? "Try a different search or clear the filters." : "Jobs organise your pipeline, team and candidates."}
          action={db.jobs.length ? <Button variant="outline" size="sm" onClick={() => (setQ(""), setDepts([]), setStatus("all"))}>Clear filters</Button> : <Button asChild size="sm"><Link href={orgPath("/jobs/new")}><Plus />Create job</Link></Button>}
        />
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-xs animate-fade-in">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-border bg-surface-2/60 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">
              <tr>
                <th className="h-9 px-4 text-left" aria-sort={sort.key === "title" ? (sort.dir === 1 ? "ascending" : "descending") : "none"}><button onClick={() => toggleSort("title")} className="inline-flex items-center gap-1 uppercase hover:text-foreground">Job<ArrowUpDown className={cn("size-3", sort.key !== "title" && "opacity-30")} /></button></th>
                <th className="h-9 px-3 text-left">Type</th>
                <th className="h-9 px-3 text-left" aria-sort={sort.key === "applicants" ? (sort.dir === 1 ? "ascending" : "descending") : "none"}><button onClick={() => toggleSort("applicants")} className="inline-flex items-center gap-1 uppercase hover:text-foreground">Applicants<ArrowUpDown className={cn("size-3", sort.key !== "applicants" && "opacity-30")} /></button></th>
                <th className="h-9 px-3 text-left">Pipeline</th>
                <th className="h-9 px-3 text-left">Hiring manager</th>
                <th className="h-9 px-3 text-left">Status</th>
                <th className="h-9 px-3 text-left" aria-sort={sort.key === "published" ? (sort.dir === 1 ? "ascending" : "descending") : "none"}><button onClick={() => toggleSort("published")} className="inline-flex items-center gap-1 uppercase hover:text-foreground">Published<ArrowUpDown className={cn("size-3", sort.key !== "published" && "opacity-30")} /></button></th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((j) => {
                const c = counts.get(j.id)!;
                return (
                  <tr key={j.id} onClick={() => router.push(orgPath(`/jobs/view?id=${j.id}`))} className="group cursor-pointer transition-colors hover:bg-accent/50">
                    <td className="px-4 py-2.5">
                      <Link href={orgPath(`/jobs/view?id=${j.id}`)} onClick={(e) => e.stopPropagation()} className="block font-medium outline-none group-hover:underline focus-visible:underline">{j.title}</Link>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><span>{j.department}</span><span className="inline-flex items-center gap-0.5"><MapPin className="size-3" />{j.location}</span></span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{j.employmentType}<br />{j.workplace}</td>
                    <td className="px-3 py-2.5"><span className="tabular font-medium">{c.total}</span>{c.newThisWeek > 0 && <span className="tabular ml-1.5 text-xs text-brand">+{c.newThisWeek} new</span>}</td>
                    <td className="px-3 py-2.5"><PipelineStrip job={j} byStage={c.byStage} /></td>
                    <td className="px-3 py-2.5"><Person id={j.hiringManagerId} /></td>
                    <td className="px-3 py-2.5"><JobStatusBadge status={j.status} /></td>
                    <td className="tabular px-3 py-2.5 text-xs text-muted-foreground">{j.publishedAt ? shortDate(j.publishedAt) : "—"}</td>
                    <td className="pr-3" onClick={(e) => e.stopPropagation()}><JobActionsMenu job={j} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 animate-fade-in sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((j) => {
            const c = counts.get(j.id)!;
            return (
              <div key={j.id} onClick={() => router.push(orgPath(`/jobs/view?id=${j.id}`))} className="group flex cursor-pointer flex-col rounded-xl border border-border bg-surface p-4 shadow-xs transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-sm">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link href={orgPath(`/jobs/view?id=${j.id}`)} onClick={(e) => e.stopPropagation()} className="block truncate font-medium outline-none group-hover:underline focus-visible:underline">{j.title}</Link>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{j.department} · {j.location} · {j.employmentType}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}><JobActionsMenu job={j} /></div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="tabular text-2xl font-semibold leading-none">{c.total}</p>
                    <p className="mt-1 text-xs text-muted-foreground">applicants{c.newThisWeek > 0 && <span className="text-brand"> · +{c.newThisWeek} this week</span>}</p>
                  </div>
                  <JobStatusBadge status={j.status} />
                </div>
                <div className="mt-3"><PipelineStrip job={j} byStage={c.byStage} wide /></div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <Person id={j.hiringManagerId} />
                  <span>{j.publishedAt ? `Published ${shortDate(j.publishedAt)}` : "Not published"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Segmented stage counts — width proportional, ordered, with a text summary for screen readers. */
function PipelineStrip({ byStage, wide }: { job: Job; byStage: Record<string, number>; wide?: boolean }) {
  const db = useDb();
  const total = STAGE_ORDER.reduce((s, k) => s + byStage[k], 0);
  if (!total) return <span className="text-xs text-subtle-foreground">No candidates</span>;
  const summary = STAGE_ORDER.filter((s) => byStage[s]).map((s) => `${db.stages.find((x) => x.id === s)?.label}: ${byStage[s]}`).join(", ");
  return (
    <div className={cn("flex h-1.5 gap-[2px] overflow-hidden rounded-full", wide ? "w-full" : "w-36")} role="img" aria-label={summary} title={summary}>
      {STAGE_ORDER.filter((s) => byStage[s]).map((s) => (
        <span key={s} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(byStage[s] / total) * 100}%`, background: STAGE_TONE[s] }} />
      ))}
    </div>
  );
}
