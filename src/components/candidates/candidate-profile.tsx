"use client";
import { orgPath } from "@/lib/org-path";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRightLeft, BriefcaseBusiness, CalendarPlus, Check, ClipboardCheck, Copy, Ellipsis, ExternalLink, FileText, GraduationCap, Languages, ListChecks, Mail, MapPin, MessageSquare, Pencil, Phone, Pin, PartyPopper, Trash2, UserX, Clock, ZoomIn, ZoomOut, Printer, Undo2, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Kbd, Textarea } from "@/components/ui/input";
import { Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/overlays";
import { EvaluationBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { SectionTitle } from "@/components/common/card";
import { LinkedInLogo } from "@/components/common/logos";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { applicationsFor, averageScore, fullName, interviewFeedback, primaryApplication } from "@/lib/api/selectors";
import { RECOMMENDATION, SCORE_LABELS, STAGE_TONE } from "@/lib/constants";
import type { Application, Candidate, ID } from "@/lib/types";
import { cn, dayLabel, relativeTime, shortDate, timeOf } from "@/lib/utils";
import { MeetingIcon } from "@/components/interviews/meeting-icon";
import { moveStage } from "@/lib/hooks/use-stage-actions";
import { useUI } from "@/components/shell/ui-context";
import { InlineEdit, TagEditor } from "./inline-edit";
import { StageTracker } from "./stage-tracker";
import { ActivityFeed } from "@/components/common/activity-feed";
import { CvTab } from "./cv-tab";
import { WITHDRAWAL_REASONS } from "@/lib/constants";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─────────────────────────── Header ─────────────────────────── */

export function CandidateHeader({ candidate, app, onSelectApp, variant = "page" }: { candidate: Candidate; app?: Application; onSelectApp: (id: ID) => void; variant?: "page" | "sheet" }) {
  const db = useDb();
  const apps = applicationsFor(db, candidate.id);
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Couldn't access clipboard"));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar name={fullName(candidate)} hue={candidate.hue} size="xl" className="max-sm:size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={cn("font-semibold tracking-tight", variant === "page" ? "text-xl" : "text-lg")}>{fullName(candidate)}</h2>
            {candidate.inTalentPool && <Badge tone="brand"><Library />Talent pool</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-foreground/80">
            {candidate.headline}
            {candidate.currentCompany && <span className="text-muted-foreground"> at {candidate.currentCompany}</span>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{candidate.location || "—"}</span>
            <button onClick={() => copy(candidate.email, "Email")} className="group inline-flex items-center gap-1 rounded hover:text-foreground" title="Copy email">
              <Mail className="size-3.5" />{candidate.email}<Copy className="size-3 opacity-0 group-hover:opacity-100" />
            </button>
            {candidate.phone && (
              <button onClick={() => copy(candidate.phone, "Phone")} className="group inline-flex items-center gap-1 rounded hover:text-foreground" title="Copy phone">
                <Phone className="size-3.5" />{candidate.phone}<Copy className="size-3 opacity-0 group-hover:opacity-100" />
              </button>
            )}
            {candidate.linkedinUrl && (
              <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded hover:text-foreground" title="LinkedIn profile">
                <LinkedInLogo className="size-3.5" />LinkedIn<ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <CandidateActions candidate={candidate} app={app} />
      </div>

      {app ? (
        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <BriefcaseBusiness className="size-3.5 text-muted-foreground" />
            {apps.length > 1 ? (
              <Select size="sm" className="h-7 w-auto min-w-48 border-transparent bg-transparent px-1.5 shadow-none hover:bg-accent" value={app.id} onValueChange={onSelectApp} ariaLabel="Application" options={apps.map((a) => ({ value: a.id, label: db.jobs.find((j) => j.id === a.jobId)?.title ?? "Job", hint: a.status !== "active" ? a.status : undefined }))} />
            ) : (
              <Link href={orgPath(`/jobs/view?id=${app.jobId}`)} className="text-sm font-medium hover:underline">{db.jobs.find((j) => j.id === app.jobId)?.title}</Link>
            )}
            <span className="text-xs text-muted-foreground">Applied {shortDate(app.appliedAt)} via {candidate.source}</span>
            <span className="ml-auto"><EvaluationBadge value={app.evaluation} /></span>
          </div>
          <StageTracker app={app} />
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border-strong p-3 text-sm text-muted-foreground">
          Not currently in any pipeline.
        </div>
      )}
    </div>
  );
}

export function CandidateActions({ candidate, app }: { candidate: Candidate; app?: Application }) {
  const ui = useUI();
  const db = useDb();
  const [confirmHire, setConfirmHire] = React.useState(false);
  const [withdraw, setWithdraw] = React.useState(false);
  const [reason, setReason] = React.useState(WITHDRAWAL_REASONS[0]);
  const active = app?.status === "active";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {app && active && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><ArrowRightLeft />Move stage</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {db.stages.map((s) => (
              <DropdownMenuItem key={s.id} disabled={s.id === app.stage} onSelect={() => (s.id === "hired" ? setConfirmHire(true) : moveStage(app, s.id))}>
                <span className="size-2 rounded-full" style={{ background: STAGE_TONE[s.id] }} />
                <span className="flex-1">{s.label}</span>
                {s.id === app.stage && <Check className="!text-foreground" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {app && (
        <ConfirmDialog open={withdraw} onOpenChange={setWithdraw} title={`Record that ${candidate.firstName} withdrew?`} description="Withdrawal is tracked separately from rejection in your analytics." confirmLabel="Record withdrawal"
          onConfirm={() => api.applications.withdraw(app.id, reason).then(() => toast(`${fullName(candidate)} marked as withdrawn`, { action: { label: "Undo", onClick: () => api.applications.restore(app.id) } }), () => {})}>
          <Select value={reason} onValueChange={setReason} ariaLabel="Withdrawal reason" options={WITHDRAWAL_REASONS.map((r) => ({ value: r, label: r }))} />
        </ConfirmDialog>
      )}
      {(app?.status === "rejected" || app?.status === "withdrawn") && (
        <Button variant="outline" size="sm" onClick={() => (api.applications.restore(app.id), toast.success("Candidate restored to the pipeline"))}><Undo2 />Restore</Button>
      )}
      <Button size="sm" onClick={() => ui.scheduleInterview({ candidateId: candidate.id, applicationId: app?.status === "active" ? app.id : undefined })} disabled={!active}>
        <CalendarPlus />Schedule
      </Button>
      <DropdownMenu>
        <Tooltip content="More actions">
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="More actions"><Ellipsis /></Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent className="w-56">
          <DropdownMenuItem onSelect={() => ui.sendEmail(candidate.id)}><Mail />Send email</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ui.openTask({ candidateId: candidate.id, jobId: app?.jobId })}><ListChecks />Create task</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ui.openScorecard({ candidateId: candidate.id, jobId: app?.jobId })} disabled={!app}><ClipboardCheck />Add evaluation</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ui.addToJob([candidate.id])}><BriefcaseBusiness />Add to another job</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => (api.candidates.setTalentPool([candidate.id], !candidate.inTalentPool), toast.success(candidate.inTalentPool ? "Removed from talent pool" : "Saved to talent pool"))}>
            <Library />{candidate.inTalentPool ? "Remove from talent pool" : "Save to talent pool"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href={orgPath(`/candidates/view?id=${candidate.id}`)}><ExternalLink />Open full profile</Link></DropdownMenuItem>
          {app && active && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmHire(true)}><PartyPopper />Mark as hired</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setWithdraw(true)}><Undo2 />Candidate withdrew</DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => ui.reject(app.id)}><UserX />Reject candidate</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {app && (
        <ConfirmDialog
          open={confirmHire}
          onOpenChange={setConfirmHire}
          title={`Mark ${candidate.firstName} as hired?`}
          description={`This moves ${fullName(candidate)} to Hired for ${db.jobs.find((j) => j.id === app.jobId)?.title}. You can undo from the notification.`}
          confirmLabel="Mark as hired"
          onConfirm={() => moveStage(app, "hired")}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Tabs ─────────────────────────── */

export function CandidateTabs({ candidate, app, variant = "page" }: { candidate: Candidate; app?: Application; variant?: "page" | "sheet" }) {
  const db = useDb();
  const [tab, setTab] = React.useState("overview");
  const interviews = db.interviews.filter((i) => i.candidateId === candidate.id && i.status !== "cancelled");
  const cards = db.scorecards.filter((s) => s.candidateId === candidate.id);
  const notes = db.notes.filter((n) => n.candidateId === candidate.id);
  React.useEffect(() => setTab("overview"), [candidate.id]);
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className={variant === "sheet" ? "sticky top-0 z-10 -mx-5 bg-surface px-4" : undefined}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="resume" count={db.cvDocuments.filter((d) => d.candidateId === candidate.id).length}>CV</TabsTrigger>
        <TabsTrigger value="interviews" count={interviews.length}>Interviews</TabsTrigger>
        <TabsTrigger value="evaluations" count={cards.length}>Evaluations</TabsTrigger>
        <TabsTrigger value="notes" count={notes.length}>Notes</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <div className="pt-5">
        <TabsContent value="overview"><OverviewTab candidate={candidate} app={app} variant={variant} onTab={setTab} /></TabsContent>
        <TabsContent value="resume"><CvTab candidate={candidate} /></TabsContent>
        <TabsContent value="interviews"><InterviewsTab candidate={candidate} app={app} /></TabsContent>
        <TabsContent value="evaluations"><EvaluationsTab candidate={candidate} app={app} /></TabsContent>
        <TabsContent value="notes"><NotesTab candidateId={candidate.id} /></TabsContent>
        <TabsContent value="activity"><ActivityFeed filter={{ candidateId: candidate.id }} /></TabsContent>
      </div>
    </Tabs>
  );
}

function DetailRow({ label, children, source }: { label: string; children: React.ReactNode; source?: "candidate" | "recruiter" }) {
  return (
    <div className="grid grid-cols-[96px_1fr_14px] items-center gap-2 py-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
      <span title={source === "candidate" ? "Provided by the candidate" : source === "recruiter" ? "Entered by your team" : undefined} className={cn("size-1.5 justify-self-center rounded-full", source === "candidate" ? "bg-brand/60" : source === "recruiter" ? "bg-signal/70" : "bg-transparent")} aria-label={source === "candidate" ? "Provided by the candidate" : source === "recruiter" ? "Entered by your team" : undefined} />
    </div>
  );
}

const EXTRA_FIELDS: [string, string][] = [["salaryExpectations", "Salary exp."], ["availability", "Availability"], ["noticePeriod", "Notice"], ["yearsExperience", "Experience"], ["country", "Country"]];

function OverviewTab({ candidate, app, variant, onTab }: { candidate: Candidate; app?: Application; variant: "page" | "sheet"; onTab: (t: string) => void }) {
  const db = useDb();
  const update = (patch: Partial<Candidate>) => api.candidates.update(candidate.id, patch).then(() => toast.success("Profile updated"));
  const next = db.interviews.filter((i) => i.candidateId === candidate.id && i.status === "scheduled" && new Date(i.start) > new Date()).sort((a, b) => a.start.localeCompare(b.start))[0];
  const pinned = db.notes.filter((n) => n.candidateId === candidate.id).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt))[0];
  const avg = averageScore(db, candidate.id);
  const allTags = Array.from(new Set(db.candidates.flatMap((c) => c.tags)));

  const side = (
    <div className="space-y-5">
      <section>
        <SectionTitle>Details</SectionTitle>
        <dl className="space-y-0.5">
          <DetailRow label="Title" source={candidate.fieldSources?.headline}><InlineEdit label="title" value={candidate.headline} onSave={(v) => update({ headline: v })} /></DetailRow>
          <DetailRow label="Company" source={candidate.fieldSources?.currentCompany}><InlineEdit label="company" value={candidate.currentCompany} onSave={(v) => update({ currentCompany: v })} /></DetailRow>
          <DetailRow label="Email" source={candidate.fieldSources?.email}><InlineEdit label="email" type="email" value={candidate.email} validate={(v) => (emailRe.test(v) ? undefined : "Enter a valid email")} onSave={(v) => update({ email: v })} /></DetailRow>
          <DetailRow label="Phone" source={candidate.fieldSources?.phone}><InlineEdit label="phone" type="tel" value={candidate.phone} onSave={(v) => update({ phone: v })} /></DetailRow>
          <DetailRow label="Location" source={candidate.fieldSources?.location}><InlineEdit label="location" value={candidate.location} onSave={(v) => update({ location: v })} /></DetailRow>
          <DetailRow label="LinkedIn" source={candidate.fieldSources?.linkedinUrl}><InlineEdit label="LinkedIn URL" value={candidate.linkedinUrl ?? ""} validate={(v) => (!v || /^https?:\/\//.test(v) ? undefined : "Use a full URL")} onSave={(v) => update({ linkedinUrl: v })} /></DetailRow>
          <DetailRow label="Portfolio" source={candidate.fieldSources?.portfolioUrl}><InlineEdit label="portfolio URL" value={candidate.portfolioUrl ?? ""} validate={(v) => (!v || /^https?:\/\//.test(v) ? undefined : "Use a full URL")} onSave={(v) => update({ portfolioUrl: v })} /></DetailRow>
          {EXTRA_FIELDS.map(([k, label]) => (
            <DetailRow key={k} label={label} source={candidate.fieldSources?.[k]}>
              <InlineEdit label={label} value={candidate.extra?.[k] ?? ""} onSave={(v) => update({ extra: { ...(candidate.extra ?? {}), [k]: v } })} />
            </DetailRow>
          ))}
          <DetailRow label="Source"><span className="text-sm">{candidate.source}</span></DetailRow>
          {app && (
            <DetailRow label="Recruiter">
              <Select size="sm" className="-ml-1.5 h-7 border-transparent bg-transparent px-1.5 shadow-none hover:bg-accent" value={app.recruiterId} ariaLabel="Recruiter" onValueChange={(v) => (api.applications.setRecruiter(app.id, v), toast.success("Recruiter updated"))} options={db.team.filter((m) => m.role === "Recruiter" || m.role === "Admin").map((m) => ({ value: m.id, label: m.name }))} />
            </DetailRow>
          )}
          <DetailRow label="Added">{<span className="text-sm">{shortDate(candidate.createdAt)}</span>}</DetailRow>
        </dl>
        <p className="mt-2 flex items-center gap-3 text-[11px] text-subtle-foreground"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-brand/60" />Candidate</span><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-signal/70" />Your team</span></p>
      </section>
      {(candidate.extra?.coverLetter || candidate.extra?.notes || candidate.extra?.education || candidate.extra?.certifications) && (
        <section>
          <SectionTitle>From the application</SectionTitle>
          <dl className="space-y-2 text-sm">
            {[["coverLetter", "Cover letter"], ["education", "Education"], ["certifications", "Certifications"], ["notes", "Additional notes"]].filter(([k]) => candidate.extra?.[k]).map(([k, label]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap text-foreground/85">{candidate.extra![k]}</dd></div>
            ))}
          </dl>
        </section>
      )}
      <section>
        <SectionTitle>Tags</SectionTitle>
        <TagEditor tags={candidate.tags} suggestions={allTags} onChange={(tags) => api.candidates.update(candidate.id, { tags })} />
      </section>
      {next && (
        <section>
          <SectionTitle>Next interview</SectionTitle>
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{next.kind}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{dayLabel(next.start)} · {timeOf(next.start)} · {next.durationMin} min · {next.meetingType}</p>
            <div className="mt-2"><AvatarStack size="sm" people={next.interviewerIds.map((id) => db.team.find((m) => m.id === id)!).filter(Boolean)} /></div>
          </div>
        </section>
      )}
    </div>
  );

  const main = (
    <div className="space-y-6">
      {(avg !== null || pinned) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {avg !== null && (
            <button onClick={() => onTab("evaluations")} className="rounded-lg border border-border p-3 text-left transition-colors hover:border-border-strong">
              <p className="text-xs text-muted-foreground">Average score</p>
              <p className="mt-1 flex items-baseline gap-1.5"><span className="tabular text-xl font-semibold">{avg.toFixed(1)}</span><span className="text-xs text-muted-foreground">/ 4 · {SCORE_LABELS[Math.round(avg)]}</span></p>
            </button>
          )}
          {pinned && (
            <button onClick={() => onTab("notes")} className="rounded-lg border border-border p-3 text-left transition-colors hover:border-border-strong">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">{pinned.pinned && <Pin className="size-3" />}Latest note · {relativeTime(pinned.createdAt)}</p>
              <p className="mt-1 line-clamp-2 text-sm">{pinned.body}</p>
            </button>
          )}
        </div>
      )}
      <section>
        <SectionTitle>Summary</SectionTitle>
        <p className="text-sm leading-relaxed text-foreground/85">{candidate.summary || <span className="text-muted-foreground">No summary yet.</span>}</p>
      </section>
      <section>
        <SectionTitle>Experience</SectionTitle>
        {candidate.experience.length === 0 ? (
          <p className="text-sm text-muted-foreground">No experience listed.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-4">
            {candidate.experience.map((e, i) => (
              <li key={i} className="relative">
                <span className={cn("absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface", i === 0 ? "bg-brand" : "bg-border-strong")} />
                <p className="text-sm font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">{e.company} · {e.start} – {e.end ?? "Present"}</p>
                {e.description && <p className="mt-1 text-sm text-foreground/80">{e.description}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <SectionTitle>Skills</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {candidate.skills.length ? candidate.skills.map((s) => <Badge key={s} tone="neutral" size="md">{s}</Badge>) : <p className="text-sm text-muted-foreground">No skills listed.</p>}
        </div>
      </section>
      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <SectionTitle>Education</SectionTitle>
          {candidate.education.map((e, i) => (
            <div key={i} className="flex gap-2">
              <GraduationCap className="mt-0.5 size-4 text-muted-foreground" />
              <div><p className="text-sm font-medium">{e.school}</p><p className="text-xs text-muted-foreground">{e.degree} · {e.year}</p></div>
            </div>
          ))}
          {candidate.education.length === 0 && <p className="text-sm text-muted-foreground">Not provided.</p>}
        </section>
        <section>
          <SectionTitle>Languages</SectionTitle>
          <p className="flex items-center gap-2 text-sm"><Languages className="size-4 text-muted-foreground" />{candidate.languages.join(", ")}</p>
        </section>
      </div>
    </div>
  );

  if (variant === "sheet")
    return (
      <div className="space-y-6">
        {main}
        <div className="border-t border-border pt-5">{side}</div>
      </div>
    );
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      {main}
      <aside className="lg:border-l lg:border-border lg:pl-6">{side}</aside>
    </div>
  );
}

function InterviewsTab({ candidate, app }: { candidate: Candidate; app?: Application }) {
  const db = useDb();
  const ui = useUI();
  const [cancelId, setCancelId] = React.useState<ID | null>(null);
  const list = db.interviews.filter((i) => i.candidateId === candidate.id).sort((a, b) => b.start.localeCompare(a.start));
  if (!list.length)
    return <EmptyState compact icon={<CalendarPlus />} title="No interviews yet" description="Schedule the first conversation to keep things moving." action={<Button size="sm" disabled={app?.status !== "active"} onClick={() => ui.scheduleInterview({ candidateId: candidate.id, applicationId: app?.id })}><CalendarPlus />Schedule interview</Button>} />;
  return (
    <div className="space-y-2">
      <div className="flex justify-end"><Button size="sm" variant="outline" disabled={app?.status !== "active"} onClick={() => ui.scheduleInterview({ candidateId: candidate.id, applicationId: app?.id })}><CalendarPlus />Schedule interview</Button></div>
      {list.map((i) => {
        const fb = interviewFeedback(db, i);
        const upcoming = i.status === "scheduled" && new Date(i.start) > new Date();
        return (
          <div key={i.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-border p-3", i.status === "cancelled" && "opacity-60")}>
            <div className="flex w-12 shrink-0 flex-col items-center rounded-md border border-border bg-surface-2 py-1">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">{new Date(i.start).toLocaleDateString("en-GB", { month: "short" })}</span>
              <span className="tabular text-base font-semibold leading-tight">{new Date(i.start).getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{i.kind} <span className="font-normal text-muted-foreground">· {db.jobs.find((j) => j.id === i.jobId)?.title}</span></p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3" />{timeOf(i.start)} · {i.durationMin} min <MeetingIcon type={i.meetingType} className="ml-1 size-3" />{i.meetingType}</p>
            </div>
            <AvatarStack size="sm" people={i.interviewerIds.map((id) => db.team.find((m) => m.id === id)!).filter(Boolean)} />
            <div className="flex items-center gap-2">
              {i.status === "cancelled" ? <Badge tone="muted">Cancelled</Badge> : upcoming ? <Badge tone="brand">Upcoming</Badge> : fb === "submitted" ? <Badge tone="success">Feedback in</Badge> : <Badge tone="warning">Feedback due</Badge>}
              {!upcoming && i.status !== "cancelled" && fb !== "submitted" && <Button size="sm" variant="outline" onClick={() => ui.openScorecard({ interviewId: i.id })}>Add feedback</Button>}
              {upcoming && <Button size="sm" variant="ghost" onClick={() => setCancelId(i.id)}>Cancel</Button>}
            </div>
          </div>
        );
      })}
      <ConfirmDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)} title="Cancel this interview?" description="Interviewers aren't notified automatically until a calendar is connected." confirmLabel="Cancel interview" destructive onConfirm={() => (api.interviews.cancel(cancelId!), toast("Interview cancelled"))} />
    </div>
  );
}

function EvaluationsTab({ candidate, app }: { candidate: Candidate; app?: Application }) {
  const db = useDb();
  const ui = useUI();
  const cards = db.scorecards.filter((s) => s.candidateId === candidate.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  if (!cards.length)
    return <EmptyState compact icon={<ClipboardCheck />} title="No evaluations yet" description="Scorecards submitted after interviews appear here." action={<Button size="sm" disabled={!app} onClick={() => ui.openScorecard({ candidateId: candidate.id, jobId: app?.jobId })}>Add evaluation</Button>} />;
  const criteria = cards[0].criteria.map((c) => ({ ...c, avg: cards.reduce((s, card) => s + (card.criteria.find((x) => x.id === c.id)?.score ?? 0), 0) / cards.length }));
  const tally = (["strong_yes", "yes", "no", "strong_no"] as const).map((r) => ({ r, n: cards.filter((c) => c.recommendation === r).length }));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[1fr_200px]">
        <div className="space-y-2.5">
          {criteria.map((c) => (
            <div key={c.id} className="grid grid-cols-[130px_1fr_32px] items-center gap-3 text-sm">
              <span className="truncate text-foreground/85">{c.label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(c.avg / 4) * 100}%` }} /></div>
              <span className="tabular text-right text-xs text-muted-foreground">{c.avg.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 sm:border-l sm:border-border sm:pl-4">
          <p className="text-xs text-muted-foreground">Recommendations</p>
          {tally.map(({ r, n }) => (
            <div key={r} className="flex items-center justify-between text-sm">
              <span className={cn(RECOMMENDATION[r].tone === "success" ? "text-success" : "text-destructive")}>{RECOMMENDATION[r].label}</span>
              <span className="tabular text-muted-foreground">{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end"><Button size="sm" variant="outline" disabled={!app} onClick={() => ui.openScorecard({ candidateId: candidate.id, jobId: app?.jobId })}><ClipboardCheck />Add evaluation</Button></div>
      {cards.map((card) => {
        const author = db.team.find((m) => m.id === card.authorId);
        const iv = db.interviews.find((i) => i.id === card.interviewId);
        return (
          <article key={card.id} className="rounded-lg border border-border p-4">
            <header className="flex items-center gap-2.5">
              {author && <Avatar name={author.name} hue={author.hue} size="sm" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{author?.name}</p>
                <p className="text-xs text-muted-foreground">{iv?.kind ?? "Evaluation"} · {shortDate(card.submittedAt)}</p>
              </div>
              <Badge tone={RECOMMENDATION[card.recommendation].tone} size="md">{RECOMMENDATION[card.recommendation].label}</Badge>
            </header>
            <p className="mt-3 text-sm leading-relaxed text-foreground/85">{card.summary}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {card.criteria.map((c) => <span key={c.id} className="text-xs text-muted-foreground">{c.label} <span className="tabular font-medium text-foreground">{c.score}</span></span>)}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function NotesTab({ candidateId }: { candidateId: ID }) {
  const db = useDb();
  const [body, setBody] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: ID; body: string } | null>(null);
  const [deleteId, setDeleteId] = React.useState<ID | null>(null);
  const notes = db.notes.filter((n) => n.candidateId === candidateId).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt));
  const me = db.team.find((m) => m.id === db.currentUserId)!;
  const add = () => {
    if (!body.trim()) return;
    api.notes.add(candidateId, body.trim());
    setBody("");
    toast.success("Note added");
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Avatar name={me.name} hue={me.hue} size="sm" className="mt-1" />
        <div className="flex-1 rounded-lg border border-input bg-surface shadow-xs transition-[border-color,box-shadow] focus-within:border-brand/60 focus-within:ring-[3px] focus-within:ring-ring/50">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && (e.preventDefault(), add())}
            placeholder="Write a note for the hiring team…"
            aria-label="New note"
            className="min-h-20 border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-2.5 pb-2">
            <span className="flex items-center gap-1 text-[11px] text-subtle-foreground"><Kbd>⌘</Kbd><Kbd>↵</Kbd> to save</span>
            <Button size="sm" onClick={add} disabled={!body.trim()}><MessageSquare />Add note</Button>
          </div>
        </div>
      </div>
      {notes.length === 0 && <EmptyState compact icon={<MessageSquare />} title="No notes yet" description="Capture impressions, logistics and follow-ups." />}
      <ul className="space-y-2">
        {notes.map((n) => {
          const author = db.team.find((m) => m.id === n.authorId);
          const isEditing = editing?.id === n.id;
          return (
            <li key={n.id} className={cn("group rounded-lg border p-3 transition-colors", n.pinned ? "border-brand/25 bg-brand-soft/40" : "border-border")}>
              <div className="flex items-center gap-2">
                {author && <Avatar name={author.name} hue={author.hue} size="xs" />}
                <span className="text-sm font-medium">{author?.name}</span>
                <span className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                {n.pinned && <Pin className="size-3 text-brand" aria-label="Pinned" />}
                <div className="ml-auto flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Tooltip content={n.pinned ? "Unpin" : "Pin"}><Button variant="ghost" size="icon-xs" aria-label={n.pinned ? "Unpin note" : "Pin note"} onClick={() => api.notes.update(n.id, { pinned: !n.pinned })}><Pin /></Button></Tooltip>
                  <Tooltip content="Edit"><Button variant="ghost" size="icon-xs" aria-label="Edit note" onClick={() => setEditing({ id: n.id, body: n.body })}><Pencil /></Button></Tooltip>
                  <Tooltip content="Delete"><Button variant="ghost" size="icon-xs" aria-label="Delete note" onClick={() => setDeleteId(n.id)}><Trash2 /></Button></Tooltip>
                </div>
              </div>
              {isEditing ? (
                <div className="mt-2 space-y-2">
                  <Textarea autoFocus value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditing(null))} aria-label="Edit note" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    <Button size="sm" disabled={!editing.body.trim()} onClick={() => (api.notes.update(n.id, { body: editing.body.trim() }), setEditing(null), toast.success("Note updated"))}>Save</Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{n.body}</p>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Delete this note?" description="This can't be undone." confirmLabel="Delete note" destructive onConfirm={() => (api.notes.remove(deleteId!), toast("Note deleted"))} />
    </div>
  );
}

/** Hook used by sheet and page to track which application is displayed. */
export function useCandidateApplication(candidateId: ID, initialAppId?: ID) {
  const db = useDb();
  const [appId, setAppId] = React.useState<ID | undefined>(initialAppId);
  React.useEffect(() => setAppId(initialAppId), [candidateId, initialAppId]);
  const app = (appId && db.applications.find((a) => a.id === appId)) || primaryApplication(db, candidateId);
  return { app, setAppId };
}

