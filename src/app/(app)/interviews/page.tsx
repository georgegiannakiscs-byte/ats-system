"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { addDays, addWeeks, format, isSameDay, isToday, startOfWeek } from "date-fns";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck, List, Clock, CircleCheck, Info } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { usePageMeta } from "@/components/shell/page-meta";
import { useUI } from "@/components/shell/ui-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Segmented, Switch, Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { ConfirmDialog, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { FilterMenu } from "@/components/common/filter-menu";
import { EmptyState } from "@/components/common/empty-state";
import { fullName, interviewFeedback } from "@/lib/api/selectors";
import { INTERVIEW_KINDS } from "@/lib/constants";
import type { Database, Interview } from "@/lib/types";
import { cn, dayLabel, timeOf } from "@/lib/utils";
import { MeetingIcon } from "@/components/interviews/meeting-icon";

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 08:00 – 18:00
const ROW = 52; // px per hour


export default function InterviewsPage() {
  return (
    <React.Suspense>
      <Interviews />
    </React.Suspense>
  );
}

function Interviews() {
  const db = useDb();
  const ui = useUI();
  const router = useRouter();
  const sp = useSearchParams();
  usePageMeta("Interviews");
  const tab = (["calendar", "list", "feedback"].includes(sp.get("tab") ?? "") ? sp.get("tab") : "calendar") as "calendar" | "list" | "feedback";
  const setTab = (t: string) => router.replace(t === "calendar" ? "/interviews" : `/interviews?tab=${t}`, { scroll: false });
  const [mine, setMine] = React.useState(false);
  const [kinds, setKinds] = React.useState<string[]>([]);

  const visible = db.interviews.filter((i) => (!mine || i.interviewerIds.includes(db.currentUserId)) && (!kinds.length || kinds.includes(i.kind)));
  const pending = visible.filter((i) => ["pending", "partial"].includes(interviewFeedback(db, i)));

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 flex-1">
          <TabsList>
            <TabsTrigger value="calendar"><CalendarDays className="size-3.5" />Calendar</TabsTrigger>
            <TabsTrigger value="list"><List className="size-3.5" />List</TabsTrigger>
            <TabsTrigger value="feedback" count={pending.length}><ClipboardCheck className="size-3.5" />Feedback</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <FilterMenu label="Type" options={INTERVIEW_KINDS.map((k) => ({ value: k, label: k }))} selected={kinds} onChange={setKinds} />
        <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-muted-foreground shadow-xs">
          <Switch checked={mine} onCheckedChange={setMine} aria-label="Only my interviews" />Only mine
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-muted-foreground md:inline-flex"><Info className="size-3.5" />Calendar sync not connected · <Link href="/settings?section=integrations" className="text-brand hover:underline">Set up</Link></span>
          <Button size="sm" onClick={() => ui.scheduleInterview()}><CalendarPlus />Schedule interview</Button>
        </div>
      </div>
      {tab === "calendar" && <WeekCalendar interviews={visible.filter((i) => i.status !== "cancelled")} />}
      {tab === "list" && <InterviewList interviews={visible} />}
      {tab === "feedback" && <FeedbackQueue interviews={pending} />}
    </div>
  );
}

function InterviewDetails({ i, db, children }: { i: Interview; db: Database; children: React.ReactNode }) {
  const ui = useUI();
  const [cancel, setCancel] = React.useState(false);
  const c = db.candidates.find((x) => x.id === i.candidateId)!;
  const job = db.jobs.find((j) => j.id === i.jobId);
  const fb = interviewFeedback(db, i);
  const upcoming = i.status === "scheduled" && new Date(i.start) > new Date();
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="w-80 p-0" side="right" align="start">
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <Avatar name={fullName(c)} hue={c.hue} size="md" />
              <div className="min-w-0">
                <p className="font-medium">{fullName(c)}</p>
                <p className="truncate text-xs text-muted-foreground">{i.kind} · {job?.title}</p>
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2"><Clock className="size-3.5 text-muted-foreground" />{dayLabel(i.start)}, {timeOf(i.start)} – {timeOf(new Date(new Date(i.start).getTime() + i.durationMin * 60000).toISOString())}</p>
              <p className="flex items-center gap-2"><MeetingIcon type={i.meetingType} className="size-3.5 text-muted-foreground" />{i.meetingType}{i.location && <span className="truncate text-muted-foreground">· {i.location}</span>}</p>
            </div>
            <div className="space-y-1.5">
              {i.interviewerIds.map((id) => {
                const m = db.team.find((t) => t.id === id);
                const submitted = db.scorecards.some((s) => s.interviewId === i.id && s.authorId === id);
                return m ? (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <Avatar name={m.name} hue={m.hue} size="xs" />{m.name}
                    {!upcoming && <span className={cn("ml-auto text-xs", submitted ? "text-success" : "text-warning")}>{submitted ? "Submitted" : "Pending"}</span>}
                  </div>
                ) : null;
              })}
            </div>
            {i.notes && <p className="rounded-md bg-surface-2 p-2 text-xs text-muted-foreground">{i.notes}</p>}
          </div>
          <div className="flex gap-2 border-t border-border p-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => ui.openCandidate(c.id, { applicationId: i.applicationId })}>View candidate</Button>
            {upcoming ? (
              <Button size="sm" variant="destructive-ghost" onClick={() => setCancel(true)}>Cancel</Button>
            ) : fb !== "submitted" && i.status !== "cancelled" ? (
              <Button size="sm" className="flex-1" onClick={() => ui.openScorecard({ interviewId: i.id })}>Add feedback</Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      <ConfirmDialog open={cancel} onOpenChange={setCancel} title="Cancel this interview?" description={`${i.kind} with ${fullName(c)}. Calendars aren't connected, so no one is notified.`} confirmLabel="Cancel interview" destructive onConfirm={() => (api.interviews.cancel(i.id), toast("Interview cancelled"))} />
    </>
  );
}

function WeekCalendar({ interviews }: { interviews: Interview[] }) {
  const db = useDb();
  const ui = useUI();
  const [anchor, setAnchor] = React.useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [days, setDays] = React.useState<"5" | "7">("5");
  const n = Number(days);
  const week = Array.from({ length: n }, (_, i) => addDays(anchor, i));
  const nowRef = React.useRef<HTMLDivElement>(null);
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const inWeek = interviews.filter((i) => week.some((d) => isSameDay(d, new Date(i.start))));
  const nowTop = ((now.getHours() + now.getMinutes() / 60 - HOURS[0]) * ROW);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="outline" size="sm" onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => setAnchor((a) => addWeeks(a, -1))}><ChevronLeft /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => setAnchor((a) => addWeeks(a, 1))}><ChevronRight /></Button>
        <h2 className="text-sm font-semibold">{format(week[0], "d MMM")} – {format(week[n - 1], "d MMM yyyy")}</h2>
        <span className="text-xs text-muted-foreground">· {inWeek.length} interview{inWeek.length === 1 ? "" : "s"}</span>
        <Segmented className="ml-auto" ariaLabel="Days shown" value={days} onChange={setDays} options={[{ value: "5", label: "Work week" }, { value: "7", label: "Week" }]} />
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <div className="min-w-[720px]">
          <div className="grid border-b border-border" style={{ gridTemplateColumns: `56px repeat(${n}, minmax(0,1fr))` }}>
            <div />
            {week.map((d) => (
              <div key={d.toISOString()} className="border-l border-border px-2 py-2 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">{format(d, "EEE")}</p>
                <p className={cn("tabular mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-semibold", isToday(d) && "bg-brand text-brand-foreground")}>{format(d, "d")}</p>
              </div>
            ))}
          </div>
          <div className="relative grid max-h-[620px] overflow-y-auto scrollbar-thin" style={{ gridTemplateColumns: `56px repeat(${n}, minmax(0,1fr))` }}>
            <div>
              {HOURS.map((h) => <div key={h} style={{ height: ROW }} className="tabular -translate-y-2 pr-2 text-right text-[11px] text-subtle-foreground">{String(h).padStart(2, "0")}:00</div>)}
            </div>
            {week.map((d) => {
              const dayItems = inWeek.filter((i) => isSameDay(d, new Date(i.start))).sort((a, b) => a.start.localeCompare(b.start));
              return (
                <div key={d.toISOString()} className={cn("relative border-l border-border", isToday(d) && "bg-brand-soft/25")}>
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      style={{ height: ROW }}
                      aria-label={`Schedule on ${format(d, "EEEE d MMMM")} at ${h}:00`}
                      onClick={() => ui.scheduleInterview({ date: format(d, "yyyy-MM-dd"), time: `${String(h).padStart(2, "0")}:00` })}
                      className="group block w-full border-b border-border/60 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent"
                    >
                      <span className="hidden text-[11px] text-subtle-foreground group-hover:inline group-focus-visible:inline">+ {String(h).padStart(2, "0")}:00</span>
                    </button>
                  ))}
                  {isToday(d) && nowTop > 0 && nowTop < HOURS.length * ROW && (
                    <div ref={nowRef} className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                      <span className="-ml-1 size-2 rounded-full bg-destructive" /><span className="h-px flex-1 bg-destructive" />
                    </div>
                  )}
                  {dayItems.map((i, idx) => {
                    const s = new Date(i.start);
                    const top = (s.getHours() + s.getMinutes() / 60 - HOURS[0]) * ROW;
                    const height = Math.max(24, (i.durationMin / 60) * ROW - 3);
                    const overlap = dayItems.filter((o) => o !== i && Math.abs(new Date(o.start).getTime() - s.getTime()) < Math.max(o.durationMin, i.durationMin) * 60000);
                    const lane = overlap.length ? dayItems.filter((o) => overlap.includes(o) || o === i).indexOf(i) : 0;
                    const lanes = overlap.length + 1;
                    const c = db.candidates.find((x) => x.id === i.candidateId)!;
                    const past = new Date(s.getTime() + i.durationMin * 60000) < now;
                    const fb = interviewFeedback(db, i);
                    return (
                      <InterviewDetails key={i.id} i={i} db={db}>
                        <button
                          className={cn(
                            "absolute z-[5] overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-left text-[11px] leading-tight shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                            past ? "border-border-strong bg-muted text-muted-foreground" : "border-brand bg-brand-soft text-brand-soft-foreground",
                          )}
                          style={{ top: top + 1, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                          aria-label={`${i.kind} with ${fullName(c)} at ${timeOf(i.start)}`}
                          data-idx={idx}
                        >
                          <span className="block truncate font-semibold">{fullName(c)}</span>
                          {height > 34 && <span className="block truncate opacity-80">{timeOf(i.start)} · {i.kind}</span>}
                          {past && fb === "pending" && height > 48 && <span className="mt-0.5 block truncate text-warning">Feedback due</span>}
                        </button>
                      </InterviewDetails>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function InterviewRow({ i }: { i: Interview }) {
  const db = useDb();
  const ui = useUI();
  const c = db.candidates.find((x) => x.id === i.candidateId)!;
  const job = db.jobs.find((j) => j.id === i.jobId);
  const fb = interviewFeedback(db, i);
  const upcoming = i.status === "scheduled" && new Date(i.start) > new Date();
  return (
    <li className={cn("grid grid-cols-[64px_1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[72px_1.4fr_1fr_auto_120px]", i.status === "cancelled" && "opacity-60")}>
      <div><p className="tabular text-sm font-semibold">{timeOf(i.start)}</p><p className="text-[11px] text-muted-foreground">{i.durationMin} min</p></div>
      <button onClick={() => ui.openCandidate(c.id, { applicationId: i.applicationId })} className="flex min-w-0 items-center gap-2.5 text-left">
        <Avatar name={fullName(c)} hue={c.hue} size="sm" />
        <span className="min-w-0"><span className="block truncate text-sm font-medium hover:underline">{fullName(c)}</span><span className="block truncate text-xs text-muted-foreground">{job?.title}</span></span>
      </button>
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><MeetingIcon type={i.meetingType} className="size-3.5" />{i.kind}</span>
      <span className="hidden sm:block"><AvatarStack size="sm" people={i.interviewerIds.map((id) => db.team.find((m) => m.id === id)!).filter(Boolean)} /></span>
      <span className="text-right">
        {i.status === "cancelled" ? <Badge tone="muted">Cancelled</Badge> : upcoming ? <Badge tone="brand">Scheduled</Badge> : fb === "submitted" ? <Badge tone="success"><CircleCheck />Feedback in</Badge> : <Button size="sm" variant="outline" onClick={() => ui.openScorecard({ interviewId: i.id })}>Add feedback</Button>}
      </span>
    </li>
  );
}

function InterviewList({ interviews }: { interviews: Interview[] }) {
  const [when, setWhen] = React.useState<"upcoming" | "past" | "cancelled">("upcoming");
  const now = Date.now();
  const list = interviews
    .filter((i) => (when === "cancelled" ? i.status === "cancelled" : i.status !== "cancelled" && (when === "upcoming" ? new Date(i.start).getTime() + i.durationMin * 60000 > now : new Date(i.start).getTime() <= now)))
    .sort((a, b) => (when === "upcoming" ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)));
  const groups = list.reduce<Record<string, Interview[]>>((acc, i) => {
    const k = format(new Date(i.start), "yyyy-MM-dd");
    (acc[k] ??= []).push(i);
    return acc;
  }, {});
  return (
    <div className="space-y-4">
      <Segmented ariaLabel="When" value={when} onChange={setWhen} options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "cancelled", label: "Cancelled" }]} />
      {list.length === 0 && <div className="rounded-xl border border-border bg-surface"><EmptyState compact icon={<CalendarDays />} title={`No ${when} interviews`} /></div>}
      {Object.entries(groups).map(([day, items]) => (
        <section key={day}>
          <h3 className={cn("mb-1.5 text-xs font-medium", isToday(new Date(day)) ? "text-brand" : "text-muted-foreground")}>{dayLabel(items[0].start)} · {format(new Date(day), "d MMMM")}</h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-xs">{items.map((i) => <InterviewRow key={i.id} i={i} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function FeedbackQueue({ interviews }: { interviews: Interview[] }) {
  const db = useDb();
  const ui = useUI();
  const sorted = [...interviews].sort((a, b) => a.start.localeCompare(b.start));
  if (!sorted.length) return <div className="rounded-xl border border-border bg-surface"><EmptyState icon={<CircleCheck />} title="All feedback is in" description="Scorecards for completed interviews will appear here when they're due." /></div>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Fresh feedback leads to better decisions. Each scorecard takes about three minutes.</p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((i) => {
          const c = db.candidates.find((x) => x.id === i.candidateId)!;
          const job = db.jobs.find((j) => j.id === i.jobId);
          const days = Math.floor((Date.now() - new Date(i.start).getTime()) / 864e5);
          return (
            <li key={i.id} className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-xs">
              <div className="flex items-start gap-3">
                <Avatar name={fullName(c)} hue={c.hue} size="md" />
                <div className="min-w-0 flex-1">
                  <button onClick={() => ui.openCandidate(c.id, { applicationId: i.applicationId })} className="block truncate text-left font-medium hover:underline">{fullName(c)}</button>
                  <p className="truncate text-xs text-muted-foreground">{job?.title}</p>
                </div>
                <Badge tone={days > 1 ? "danger" : "warning"}>{days <= 0 ? "Due today" : `${days}d ago`}</Badge>
              </div>
              <p className="mt-3 text-sm">{i.kind}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(i.start), "EEE d MMM, HH:mm")}</p>
              <div className="mt-3 flex items-center justify-between">
                <AvatarStack size="sm" people={i.interviewerIds.map((id) => db.team.find((m) => m.id === id)!).filter(Boolean)} />
                <Button size="sm" onClick={() => ui.openScorecard({ interviewId: i.id })}><ClipboardCheck />Submit scorecard</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
