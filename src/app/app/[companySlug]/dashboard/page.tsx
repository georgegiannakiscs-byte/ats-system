"use client";
import { orgPath } from "@/lib/org-path";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isToday, format } from "date-fns";
import { ArrowRight, BriefcaseBusiness, CalendarClock, ClipboardCheck, FileSignature, Inbox, Plus, Users, CalendarPlus, ListChecks, CircleCheck } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { usePageMeta } from "@/components/shell/page-meta";
import { useUI } from "@/components/shell/ui-context";
import { Card, CardHeader } from "@/components/common/card";
import { Button } from "@/components/ui/button";
import { AvatarStack, Avatar } from "@/components/ui/avatar";
import { Segmented } from "@/components/ui/controls";
import { ActivityFeed } from "@/components/common/activity-feed";
import { EmptyState } from "@/components/common/empty-state";
import { BarList, ColumnChart } from "@/components/charts/chart-kit";
import { TaskRow } from "@/components/tasks/task-row";
import { fullName, jobCounts, pendingEvaluations, upcomingInterviews } from "@/lib/api/selectors";
import { STAGE_ORDER } from "@/lib/constants";
import { bySource, weeklyApplications } from "@/lib/analytics";
import { cn, dayLabel, timeOf } from "@/lib/utils";
import { MeetingIcon } from "@/components/interviews/meeting-icon";

const ONBOARDING_STEPS = ["info", "logo", "branding", "careers", "team", "pipeline", "job", "publish"];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
}

export default function OverviewPage() {
  const db = useDb();
  const ui = useUI();
  const router = useRouter();
  usePageMeta("Overview");
  const me = db.team.find((m) => m.id === db.currentUserId)!;

  const stats = React.useMemo(() => {
    const active = db.applications.filter((a) => a.status === "active");
    const weekAgo = Date.now() - 7 * 864e5;
    const upcoming = upcomingInterviews(db);
    return {
      jobs: db.jobs.filter((j) => j.status === "published").length,
      jobsDraft: db.jobs.filter((j) => j.status === "draft").length,
      candidates: active.length,
      newApps: db.applications.filter((a) => new Date(a.appliedAt).getTime() > weekAgo).length,
      newUnreviewed: active.filter((a) => a.stage === "applied").length,
      interviews: upcoming.length,
      interviewsToday: upcoming.filter((i) => isToday(new Date(i.start))).length,
      pending: pendingEvaluations(db).length,
      pendingMine: pendingEvaluations(db).filter((i) => i.interviewerIds.includes(db.currentUserId)).length,
      offers: active.filter((a) => a.stage === "offer").length,
      hired: db.applications.filter((a) => a.status === "hired").length,
    };
  }, [db]);

  const myTasks = db.tasks.filter((t) => !t.done && t.assigneeId === db.currentUserId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const attention = myTasks.filter((t) => new Date(t.dueDate).getTime() < Date.now() + 864e5 * 2).slice(0, 5);
  const upcoming = upcomingInterviews(db).slice(0, 6);
  const [chart, setChart] = React.useState<"weekly" | "source">("weekly");

  const cards = [
    { label: "Active jobs", value: stats.jobs, sub: stats.jobsDraft ? `${stats.jobsDraft} draft` : "All published", href: orgPath("/jobs?status=published"), icon: BriefcaseBusiness },
    { label: "Candidates in process", value: stats.candidates, sub: `${stats.hired} hired to date`, href: orgPath("/candidates"), icon: Users },
    { label: "New applications", value: stats.newApps, sub: `${stats.newUnreviewed} waiting in Applied`, href: orgPath("/candidates?stage=applied"), icon: Inbox, accent: stats.newUnreviewed > 0 },
    { label: "Upcoming interviews", value: stats.interviews, sub: `${stats.interviewsToday} today`, href: orgPath("/interviews"), icon: CalendarClock },
    { label: "Pending evaluations", value: stats.pending, sub: stats.pendingMine ? `${stats.pendingMine} assigned to you` : "None assigned to you", href: orgPath("/interviews?tab=feedback"), icon: ClipboardCheck, warn: stats.pendingMine > 0 },
    { label: "Offers in progress", value: stats.offers, sub: "Awaiting decision", href: orgPath("/candidates?stage=offer"), icon: FileSignature },
  ];

  const activeJobs = db.jobs.filter((j) => j.status === "published" || j.status === "on_hold");
  const stageTotals = STAGE_ORDER.map((s) => ({ key: s, label: db.stages.find((x) => x.id === s)!.label, value: db.applications.filter((a) => a.stage === s && a.status !== "rejected").length }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-subtle-foreground">{format(new Date(), "EEEE d MMMM")}</p>
          <h2 className="mt-1 font-display text-[32px] leading-none tracking-tight">
            {greeting()}, {me.name.split(" ")[0]}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You have <Link href={orgPath("/interviews")} className="font-medium text-foreground hover:underline">{stats.interviewsToday} interview{stats.interviewsToday === 1 ? "" : "s"} today</Link>
            {attention.length > 0 && <> and <Link href={orgPath("/tasks")} className="font-medium text-foreground hover:underline">{attention.length} task{attention.length === 1 ? "" : "s"} needing attention</Link></>}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => ui.scheduleInterview()}><CalendarPlus />Schedule</Button>
          <Button asChild><Link href={orgPath("/jobs/new")}><Plus />Create job</Link></Button>
        </div>
      </section>

      {db.org.role === "admin" && ONBOARDING_STEPS.some((k) => !db.org.onboarding[k]) && (
        <Link href={`/app/new?org=${db.org.id}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-signal/30 bg-signal-soft/40 p-4 transition-colors hover:border-signal/50">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Finish setting up {db.org.name}</p>
            <p className="text-xs text-muted-foreground">{ONBOARDING_STEPS.filter((k) => db.org.onboarding[k]).length} of {ONBOARDING_STEPS.length} steps done - logo, branding, careers page, team and your first job.</p>
          </div>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-signal" style={{ width: `${(ONBOARDING_STEPS.filter((k) => db.org.onboarding[k]).length / ONBOARDING_STEPS.length) * 100}%` }} /></div>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      )}

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="group rounded-xl border border-border bg-surface p-3.5 shadow-xs outline-none transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className="size-3.5 text-subtle-foreground transition-colors group-hover:text-foreground" />
            </div>
            <p className="tabular mt-2 text-[26px] font-semibold leading-none tracking-tight">{c.value}</p>
            <p className={cn("mt-2 flex items-center gap-1 truncate text-xs", c.warn ? "text-warning" : c.accent ? "text-brand" : "text-muted-foreground")}>
              {(c.warn || c.accent) && <span className="size-1.5 rounded-full bg-current" />}
              {c.sub}
            </p>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recruitment pipeline" description="All active candidates across open roles" href={orgPath("/candidates")} />
          <div className="grid gap-6 px-4 pb-4 pt-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            <div>
              <BarList items={stageTotals} onSelect={(s) => router.push(orgPath(`/candidates?stage=${s}`))} />
            </div>
            <div className="min-w-0">
              <div className="mb-1 grid grid-cols-[1fr_56px_56px_56px] gap-2 px-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">
                <span>Open role</span><span className="text-right">Active</span><span className="text-right">New</span><span className="text-right">Offer</span>
              </div>
              <ul>
                {activeJobs.slice(0, 7).map((j) => {
                  const c = jobCounts(db, j.id);
                  return (
                    <li key={j.id}>
                      <Link href={orgPath(`/jobs/view?id=${j.id}`)} className="grid h-10 grid-cols-[1fr_56px_56px_56px] items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-accent">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{j.title}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{j.department} · {j.location}{j.status === "on_hold" && " · On hold"}</span>
                        </span>
                        <span className="tabular text-right">{c.active}</span>
                        <span className={cn("tabular text-right", c.newThisWeek ? "text-brand" : "text-subtle-foreground")}>{c.newThisWeek ? `+${c.newThisWeek}` : "-"}</span>
                        <span className="tabular text-right">{c.byStage.offer || <span className="text-subtle-foreground">-</span>}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Upcoming interviews" description={`${stats.interviews} scheduled`} href={orgPath("/interviews")} action={<Button variant="ghost" size="icon-sm" aria-label="Schedule interview" onClick={() => ui.scheduleInterview()}><Plus /></Button>} />
          {upcoming.length === 0 ? (
            <EmptyState compact icon={<CalendarClock />} title="Nothing scheduled" description="Interviews you schedule appear here." />
          ) : (
            <ul className="px-2 pb-2">
              {upcoming.map((i) => {
                const c = db.candidates.find((x) => x.id === i.candidateId)!;
                return (
                  <li key={i.id}>
                    <button onClick={() => ui.openCandidate(c.id, { applicationId: i.applicationId })} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent">
                      <div className="w-14 shrink-0">
                        <p className={cn("text-[11px] font-medium", isToday(new Date(i.start)) ? "text-signal" : "text-muted-foreground")}>{dayLabel(i.start)}</p>
                        <p className="tabular text-sm font-semibold">{timeOf(i.start)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fullName(c)}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MeetingIcon type={i.meetingType} className="size-3 shrink-0" />{i.kind}</p>
                      </div>
                      <AvatarStack people={i.interviewerIds.map((id) => db.team.find((m) => m.id === id)!).filter(Boolean)} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Needs your attention" description="Overdue and due soon" href={orgPath("/tasks")} action={<Button variant="ghost" size="icon-sm" aria-label="New task" onClick={() => ui.openTask()}><Plus /></Button>} />
          <div className="px-2 pb-2">
            {attention.length === 0 ? <EmptyState compact icon={<CircleCheck />} title="You're all caught up" description="Nothing due in the next two days." /> : attention.map((t) => <TaskRow key={t.id} task={t} compact />)}
            {myTasks.length > attention.length && (
              <Link href={orgPath("/tasks")} className="mt-1 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <ListChecks className="size-3.5" />{myTasks.length - attention.length} more open tasks<ArrowRight className="ml-auto size-3" />
              </Link>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recruitment performance"
            description={chart === "weekly" ? "Applications per week" : "Applications by source"}
            href={orgPath("/analytics")}
            action={<Segmented ariaLabel="Chart" value={chart} onChange={setChart} options={[{ value: "weekly", label: "Weekly" }, { value: "source", label: "Source" }]} />}
          />
          <div className="px-3 pb-3">
            {chart === "weekly" ? (
              <ColumnChart data={weeklyApplications(db, 8)} x="week" y="applications" name="Applications" height={232} />
            ) : (
              <div className="px-1 pt-1"><BarList items={bySource(db).slice(0, 6).map((s) => ({ key: s.source, label: s.source, value: s.applications }))} onSelect={(s) => router.push(orgPath(`/candidates?source=${encodeURIComponent(s)}`))} /></div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent activity" description="Across your workspace" />
          <div className="max-h-[300px] overflow-y-auto px-4 pb-2 pt-1 scrollbar-thin">
            <ActivityFeed limit={10} showContext />
          </div>
        </Card>
      </div>

    </div>
  );
}
