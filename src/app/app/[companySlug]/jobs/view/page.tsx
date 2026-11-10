"use client";
import { orgPath } from "@/lib/org-path";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, Clock, Users, Pencil, Send, Building, CalendarPlus, BriefcaseBusiness, Banknote } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { usePageMeta } from "@/components/shell/page-meta";
import { useUI } from "@/components/shell/ui-context";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { JobStatusBadge, StageBadge, EvaluationBadge } from "@/components/common/badges";
import { Person } from "@/components/common/person";
import { EmptyState } from "@/components/common/empty-state";
import { SectionTitle } from "@/components/common/card";
import { ActivityFeed } from "@/components/common/activity-feed";
import { JobPipeline } from "@/components/pipeline/job-pipeline";
import { JobActionsMenu, useJobStatusChange } from "@/components/jobs/job-actions";
import { fullName, interviewFeedback, jobCounts } from "@/lib/api/selectors";
import type { Interview } from "@/lib/types";
import { cn, daysSince, dayLabel, formatSalary, shortDate, timeOf } from "@/lib/utils";
import { MeetingIcon } from "@/components/interviews/meeting-icon";

export default function JobPage() {
  return (
    <React.Suspense>
      <JobView />
    </React.Suspense>
  );
}

const TABS = ["pipeline", "candidates", "interviews", "details", "activity"] as const;

function JobView() {
  const db = useDb();
  const router = useRouter();
  const sp = useSearchParams();
  const jobId = sp.get("id") ?? "";
  const tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? sp.get("tab")! : "pipeline";
  const job = db.jobs.find((j) => j.id === jobId);
  const setStatus = useJobStatusChange();
  usePageMeta(job?.title ?? "Job not found", [{ label: "Jobs", href: orgPath("/jobs") }]);

  if (!job)
    return <EmptyState icon={<BriefcaseBusiness />} title="This job doesn't exist" description="It may have been deleted." action={<Button asChild variant="outline"><Link href={orgPath("/jobs")}>Back to jobs</Link></Button>} />;

  const counts = jobCounts(db, job.id);
  const interviews = db.interviews.filter((i) => i.jobId === job.id);
  const inInterviews = ["hr_interview", "hm_interview", "technical", "final_review"].reduce((s, k) => s + counts.byStage[k as keyof typeof counts.byStage], 0);
  const setTab = (t: string) => router.replace(orgPath(`/jobs/view?id=${job.id}${t === "pipeline" ? "" : `&tab=${t}`}`), { scroll: false });

  const kpis = [
    { label: "Applicants", value: counts.total },
    { label: "New this week", value: counts.newThisWeek },
    { label: "In interviews", value: inInterviews },
    { label: "Offers", value: counts.byStage.offer },
    { label: "Hired", value: `${counts.hired}/${job.openings}` },
    { label: "Days open", value: job.publishedAt ? daysSince(job.publishedAt) : "—" },
  ];

  return (
    <div className="flex min-h-[calc(100dvh-48px)] flex-col">
      <div className="border-b border-border bg-surface/60 px-4 pt-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{job.title}</h2>
              <JobStatusBadge status={job.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Building className="size-3.5" />{job.department}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{job.location} · {job.workplace}</span>
              <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{job.employmentType}</span>
              <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{job.openings} opening{job.openings > 1 ? "s" : ""}</span>
              <span className="inline-flex items-center gap-1.5">Hiring manager <Person id={job.hiringManagerId} /></span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" asChild><Link href={orgPath(`/jobs/edit?id=${job.id}`)}><Pencil />Edit</Link></Button>
            {job.status !== "published" && <Button size="sm" onClick={() => setStatus(job, "published")}><Send />Publish</Button>}
            <JobActionsMenu job={job} trigger="button" afterDelete={() => router.push(orgPath("/jobs"))} />
          </div>
        </div>
        <dl className="mt-4 flex gap-6 overflow-x-auto scrollbar-none">
          {kpis.map((k) => (
            <div key={k.label} className="shrink-0">
              <dt className="text-[11px] text-muted-foreground">{k.label}</dt>
              <dd className="tabular text-base font-semibold">{k.value}</dd>
            </div>
          ))}
        </dl>
        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList className="border-b-0">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="candidates" count={counts.total}>Candidates</TabsTrigger>
            <TabsTrigger value="interviews" count={interviews.filter((i) => i.status === "scheduled").length}>Interviews</TabsTrigger>
            <TabsTrigger value="details">Job details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "pipeline" && <div className="flex flex-1 flex-col pt-1 animate-fade-in"><JobPipeline jobId={job.id} /></div>}
      {tab === "candidates" && <JobCandidates jobId={job.id} />}
      {tab === "interviews" && <JobInterviews jobId={job.id} />}
      {tab === "details" && <JobDetails jobId={job.id} />}
      {tab === "activity" && <div className="mx-auto w-full max-w-3xl p-6 animate-fade-in"><ActivityFeed filter={{ jobId: job.id }} showContext /></div>}
    </div>
  );
}

function JobCandidates({ jobId }: { jobId: string }) {
  const db = useDb();
  const ui = useUI();
  const [status, setStatus] = React.useState<"all" | "active" | "rejected" | "hired">("all");
  const apps = db.applications.filter((a) => a.jobId === jobId && (status === "all" || a.status === status)).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  const ids = apps.map((a) => a.candidateId);
  return (
    <div className="mx-auto w-full max-w-6xl p-4 animate-fade-in sm:p-6">
      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <TabsList className="mb-4">
          {(["all", "active", "hired", "rejected"] as const).map((s) => (
            <TabsTrigger key={s} value={s} count={db.applications.filter((a) => a.jobId === jobId && (s === "all" || a.status === s)).length} className="capitalize">{s}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {apps.length === 0 ? <EmptyState compact title="No candidates here" /> : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-xs">
          {apps.map((a) => {
            const c = db.candidates.find((x) => x.id === a.candidateId)!;
            return (
              <li key={a.id}>
                <button onClick={() => ui.openCandidate(c.id, { applicationId: a.id, list: ids })} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50 sm:grid-cols-[1.5fr_1fr_1fr_100px]">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={fullName(c)} hue={c.hue} size="sm" />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{fullName(c)}</span><span className="block truncate text-xs text-muted-foreground">{c.headline}</span></span>
                  </span>
                  <StageBadge stage={a.stage} status={a.status} />
                  <span className="hidden sm:block">{a.status === "rejected" ? <span className="truncate text-xs text-muted-foreground">{a.rejectionReason}</span> : <EvaluationBadge value={a.evaluation} />}</span>
                  <span className="tabular hidden text-right text-xs text-muted-foreground sm:block">{shortDate(a.appliedAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function JobInterviews({ jobId }: { jobId: string }) {
  const db = useDb();
  const ui = useUI();
  const list = db.interviews.filter((i) => i.jobId === jobId && i.status !== "cancelled").sort((a, b) => b.start.localeCompare(a.start));
  const now = new Date();
  const upcoming = list.filter((i) => new Date(i.start) > now).reverse();
  const past = list.filter((i) => new Date(i.start) <= now);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 animate-fade-in sm:p-6">
      <div className="flex justify-end"><Button size="sm" onClick={() => ui.scheduleInterview()}><CalendarPlus />Schedule interview</Button></div>
      <section>
        <SectionTitle>Upcoming · {upcoming.length}</SectionTitle>
        {upcoming.length ? <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-xs">{upcoming.map((i) => <InterviewLine key={i.id} i={i} />)}</ul> : <EmptyState compact title="No upcoming interviews" />}
      </section>
      <section>
        <SectionTitle>Past · {past.length}</SectionTitle>
        {past.length ? <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-xs">{past.map((i) => <InterviewLine key={i.id} i={i} />)}</ul> : <EmptyState compact title="No past interviews" />}
      </section>
    </div>
  );
}

function JobDetails({ jobId }: { jobId: string }) {
  const db = useDb();
  const job = db.jobs.find((j) => j.id === jobId)!;
  const list = (s: string) => s.split("\n").filter(Boolean);
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 p-4 animate-fade-in sm:p-6 lg:grid-cols-[1fr_300px]">
      <article className="space-y-6 rounded-xl border border-border bg-surface p-6 shadow-xs">
        <section><SectionTitle>About the role</SectionTitle><p className="text-sm leading-relaxed">{job.summary}</p></section>
        <section><SectionTitle>Responsibilities</SectionTitle><ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed marker:text-subtle-foreground">{list(job.responsibilities).map((l) => <li key={l}>{l}</li>)}</ul></section>
        <section><SectionTitle>Requirements</SectionTitle><ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed marker:text-subtle-foreground">{list(job.requirements).map((l) => <li key={l}>{l}</li>)}</ul></section>
        <section><SectionTitle>Skills</SectionTitle><div className="flex flex-wrap gap-1.5">{job.skills.map((s) => <Badge key={s} size="md">{s}</Badge>)}</div></section>
      </article>
      <aside className="space-y-5">
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm shadow-xs">
          {[
            ["Seniority", job.seniority],
            ["Employment", job.employmentType],
            ["Workplace", `${job.workplace} · ${job.location}`],
            ["Openings", String(job.openings)],
            ["Created", shortDate(job.createdAt)],
            ["Published", job.publishedAt ? shortDate(job.publishedAt) : "Not published"],
            ["Target hire", job.targetHireDate ? shortDate(job.targetHireDate) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Banknote className="size-3.5" />Salary</span><span className="tabular">{formatSalary(job.salaryMin, job.salaryMax, job.currency)}</span></div>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-xs">
          <SectionTitle className="mb-0">Hiring team</SectionTitle>
          <div className="flex items-center justify-between"><Person id={job.hiringManagerId} size="sm" /><span className="text-xs text-muted-foreground">Hiring manager</span></div>
          <div className="flex items-center justify-between"><Person id={job.recruiterId} size="sm" /><span className="text-xs text-muted-foreground">Recruiter</span></div>
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm shadow-xs">
          <SectionTitle className="mb-1">Channels</SectionTitle>
          <p className="flex justify-between"><span>Careers page</span><span className={cn(job.channels.careersPage ? "text-success" : "text-muted-foreground")}>{job.channels.careersPage ? "On" : "Off"}</span></p>
          <p className="flex justify-between"><span>LinkedIn</span><span className="text-muted-foreground">{job.channels.linkedin ? "Queued (not connected)" : "Off"}</span></p>
          <p className="flex justify-between"><span>Indeed</span><span className="text-muted-foreground">{job.channels.indeed ? "Queued (not connected)" : "Off"}</span></p>
        </div>
      </aside>
    </div>
  );
}

function InterviewLine({ i }: { i: Interview }) {
  const db = useDb();
  const ui = useUI();
    const c = db.candidates.find((x) => x.id === i.candidateId)!;
    const fb = interviewFeedback(db, i);
    return (
      <li className="flex items-center gap-3 px-4 py-2.5">
        <div className="w-24 shrink-0"><p className="text-xs text-muted-foreground">{dayLabel(i.start)}</p><p className="tabular text-sm font-medium">{timeOf(i.start)}</p></div>
        <button onClick={() => ui.openCandidate(c.id, { applicationId: i.applicationId })} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <Avatar name={fullName(c)} hue={c.hue} size="sm" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium hover:underline">{fullName(c)}</span><span className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MeetingIcon type={i.meetingType} className="size-3" />{i.kind}</span></span>
        </button>
        <AvatarStack size="sm" people={i.interviewerIds.map((id) => db.team.find((m) => m.id === id)!).filter(Boolean)} />
        <div className="w-32 text-right">
          {fb === "n/a" ? <Badge tone="brand">Scheduled</Badge> : fb === "submitted" ? <Badge tone="success">Feedback in</Badge> : <Button size="sm" variant="outline" onClick={() => ui.openScorecard({ interviewId: i.id })}>Add feedback</Button>}
        </div>
      </li>
    );
}
