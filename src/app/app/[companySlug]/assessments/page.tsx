"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Archive, Check, ClipboardCheck, Download, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useCan, useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { orgPath } from "@/lib/org-path";
import { usePageMeta } from "@/components/shell/page-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlays";
import { EmptyState } from "@/components/common/empty-state";
import { SearchInput } from "@/components/common/search-input";
import { QC_LABEL, QuestionDialog, qcStatus } from "@/components/assessments/quick-check-ui";
import type { AssessmentQuestion } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

const TABS = ["questions", "jobs", "responses"] as const;

export default function AssessmentsPage() {
  return <React.Suspense><Assessments /></React.Suspense>;
}

function Assessments() {
  const db = useDb();
  const canView = useCan("assessments.view");
  const canManage = useCan("assessments.manage");
  const router = useRouter();
  const sp = useSearchParams();
  usePageMeta("Assessments");
  const tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? sp.get("tab")! : "questions";
  const setTab = (t: string) => router.replace(orgPath(`/assessments${t === "questions" ? "" : `?tab=${t}`}`), { scroll: false });
  const [editing, setEditing] = React.useState<AssessmentQuestion | null | undefined>(undefined);
  const [generateOpen, setGenerateOpen] = React.useState(false);

  if (db.org.features.quick_check === false) return <div className="p-6"><EmptyState icon={<ClipboardCheck />} title="Quick Check isn't enabled" description="The platform administrator hasn't enabled Quick Check for this company." /></div>;
  if (!canView) return <div className="p-6"><EmptyState icon={<ClipboardCheck />} title="No access" description="Your role can't view assessments in this company." /></div>;

  const completed = db.assessmentAttempts.filter((a) => a.status === "completed");
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="max-w-2xl text-sm text-muted-foreground">Short, role-related Quick Checks that candidates can take after applying. Questions are written or AI-drafted, then approved by a person. Results are reviewed alongside the application — they never move or reject anyone automatically.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(true)}><Sparkles className="text-signal" />Draft with AI</Button>
            <Button onClick={() => setEditing(null)}><Plus />New question</Button>
          </div>
        )}
      </div>
      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="questions" count={db.assessmentQuestions.filter((q) => q.status !== "archived").length}>Question bank</TabsTrigger>
          <TabsTrigger value="jobs" count={Object.values(db.jobAssessments).filter((c) => c.enabled).length}>Jobs</TabsTrigger>
          <TabsTrigger value="responses" count={completed.length}>Responses</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="pt-4">
        {tab === "questions" && <QuestionBank onEdit={setEditing} />}
        {tab === "jobs" && <JobsTab />}
        {tab === "responses" && <ResponsesTab />}
      </div>
      <QuestionDialog open={editing !== undefined} onOpenChange={(v) => !v && setEditing(undefined)} question={editing ?? null} />
      <GenerateDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
}

const STATUS_TONE = { draft: "warning", approved: "success", archived: "muted" } as const;

function QuestionBank({ onEdit }: { onEdit: (q: AssessmentQuestion) => void }) {
  const db = useDb();
  const canManage = useCan("assessments.manage");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"all" | "draft" | "approved" | "archived">("all");
  const [job, setJob] = React.useState("all");
  const list = db.assessmentQuestions
    .filter((x) => (status === "all" ? x.status !== "archived" : x.status === status))
    .filter((x) => job === "all" || x.jobId === job || (job === "none" && !x.jobId))
    .filter((x) => !q || `${x.questionText} ${x.competency}`.toLowerCase().includes(q.toLowerCase()));
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); } catch {} };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search questions" />
        <Select size="sm" className="w-40" value={status} onValueChange={(v) => setStatus(v as typeof status)} options={[{ value: "all", label: "Draft & approved" }, { value: "draft", label: "Drafts" }, { value: "approved", label: "Approved" }, { value: "archived", label: "Archived" }]} ariaLabel="Status" />
        <Select size="sm" className="w-48" value={job} onValueChange={setJob} options={[{ value: "all", label: "All jobs" }, { value: "none", label: "Not job-specific" }, ...db.jobs.map((j) => ({ value: j.id, label: j.title }))]} ariaLabel="Job" />
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface"><EmptyState icon={<ClipboardCheck />} title="No questions yet" description="Write a practical scenario question, or draft a set from a job's description with AI and review it." /></div>
      ) : (
        <ul className="space-y-2">
          {list.map((x) => (
            <li key={x.id} className="rounded-xl border border-border bg-surface p-4 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS_TONE[x.status]}>{x.status === "draft" ? "Draft — needs approval" : x.status === "approved" ? "Approved" : "Archived"}</Badge>
                    {x.source === "ai" && <Badge tone="outline" title={`${x.aiModel ?? ""} · ${x.generationVersion ?? ""}`}><Sparkles />AI-drafted</Badge>}
                    <span className="text-xs text-muted-foreground">{x.type === "multiple_choice" ? "Multiple choice" : "Short written"} · {x.language.toUpperCase()} · {x.difficulty} · v{x.version}{x.jobId ? ` · ${db.jobs.find((j) => j.id === x.jobId)?.title ?? "job"}` : ""}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-relaxed">{x.questionText}</p>
                  {x.type === "multiple_choice" && (
                    <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      {x.options.map((o) => <li key={o.id} className={o.id === x.correctOptionId ? "text-success" : "text-muted-foreground"}><span className="mr-1 font-medium">{o.id}.</span>{o.text}{o.id === x.correctOptionId && " ✓"}</li>)}
                    </ul>
                  )}
                  {x.explanation && <p className="mt-2 text-xs text-muted-foreground">{x.type === "multiple_choice" ? "Why:" : "Strong answers cover:"} {x.explanation}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    {x.status === "draft" && <Button size="sm" onClick={() => act(() => api.assessments.setStatus(x.id, "approve"), "Approved")}><Check />Approve</Button>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {x.status !== "archived" && <DropdownMenuItem onSelect={() => onEdit(x)}><Pencil />Edit</DropdownMenuItem>}
                        {x.status !== "archived" ? <DropdownMenuItem onSelect={() => act(() => api.assessments.setStatus(x.id, "archive"), "Archived")}><Archive />Archive</DropdownMenuItem> : <DropdownMenuItem onSelect={() => act(() => api.assessments.setStatus(x.id, "restore"), "Restored as draft")}><RotateCcw />Restore as draft</DropdownMenuItem>}
                        {x.status === "draft" && <DropdownMenuItem destructive onSelect={() => act(() => api.assessments.removeQuestion(x.id), "Deleted")}><Trash2 />Delete draft</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobsTab() {
  const db = useDb();
  const jobs = db.jobs.filter((j) => j.status !== "archived");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted-foreground">
          <tr><th className="px-4 py-2 font-medium">Job</th><th className="px-4 py-2 font-medium">Quick Check</th><th className="px-4 py-2 font-medium">Questions</th><th className="px-4 py-2 font-medium">Invited</th><th className="px-4 py-2 font-medium">Completed</th><th /></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.map((j) => {
            const c = db.jobAssessments[j.id];
            const at = db.assessmentAttempts.filter((a) => a.jobId === j.id);
            return (
              <tr key={j.id}>
                <td className="px-4 py-2.5 font-medium">{j.title}</td>
                <td className="px-4 py-2.5">{c?.enabled ? <Badge tone="success">On</Badge> : <Badge tone="muted">Off</Badge>}</td>
                <td className="tabular px-4 py-2.5">{c?.questionIds.length ?? 0}</td>
                <td className="tabular px-4 py-2.5">{at.length}</td>
                <td className="tabular px-4 py-2.5">{at.filter((a) => a.status === "completed").length}</td>
                <td className="px-4 py-2.5 text-right"><Link className="text-sm underline-offset-2 hover:underline" href={orgPath(`/jobs/view?id=${j.id}&tab=quick-check`)}>Configure</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {jobs.length === 0 && <EmptyState icon={<ClipboardCheck />} title="No jobs yet" description="Create a job, then enable Quick Check for it." />}
    </div>
  );
}

function ResponsesTab() {
  const db = useDb();
  const [job, setJob] = React.useState("all");
  const rows = db.assessmentAttempts.filter((a) => !a.statusOnly && (job === "all" || a.jobId === job));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Select size="sm" className="w-56" value={job} onValueChange={setJob} options={[{ value: "all", label: "All jobs" }, ...db.jobs.map((j) => ({ value: j.id, label: j.title }))]} ariaLabel="Job" />
        <Button size="sm" variant="outline" className="ml-auto" asChild><a href={api.assessments.exportUrl(job === "all" ? undefined : job)}><Download />Export CSV</a></Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-xs">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted-foreground">
            <tr><th className="px-4 py-2 font-medium">Candidate</th><th className="px-4 py-2 font-medium">Job</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Answer key matches</th><th className="px-4 py-2 font-medium">Accommodation</th><th className="px-4 py-2 font-medium">Updated</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((a) => {
              const c = db.candidates.find((x) => x.id === a.candidateId);
              const j = db.jobs.find((x) => x.id === a.jobId);
              const mc = a.responses?.filter((r) => r.type === "multiple_choice") ?? [];
              return (
                <tr key={a.id}>
                  <td className="px-4 py-2.5"><Link className="font-medium hover:underline" href={orgPath(`/candidates/view?id=${a.candidateId}&tab=quick-check`)}>{c?.fullName ?? `${c?.firstName ?? ""} ${c?.lastName ?? ""}`}</Link></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{j?.title}</td>
                  <td className="px-4 py-2.5"><Badge tone="neutral">{QC_LABEL[qcStatus(db, a.applicationId, a.jobId!)]}</Badge></td>
                  <td className="tabular px-4 py-2.5">{a.status === "completed" && mc.length ? `${mc.filter((r) => r.isCorrect).length}/${mc.length}` : "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.accommodation === "none" ? "—" : a.accommodation === "extended" ? "Extended" : "Untimed"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{relativeTime(a.completedAt ?? a.startedAt ?? a.createdAt!)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState icon={<ClipboardCheck />} title="No Quick Checks yet" description="Invitations and responses will appear here." />}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Answer-key matches are a deterministic comparison with the approved key. They are not a ranking or a fit score.</p>
    </div>
  );
}

function GenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb();
  const jobs = db.jobs.filter((j) => j.status !== "archived");
  const [jobId, setJobId] = React.useState("");
  const [count, setCount] = React.useState(4);
  const [language, setLanguage] = React.useState<"en" | "el">("en");
  const [mix, setMix] = React.useState<"multiple_choice" | "mixed">("multiple_choice");
  const [competencies, setCompetencies] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const unavailable = db.ai.unavailable.question_generation;
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.assessments.generate({ jobId, count, language, competencies, mix });
      toast.success(`${r.ids.length} draft question${r.ids.length === 1 ? "" : "s"} added`, { description: `Review and approve each one before use.${r.rejected.length ? ` ${r.rejected.length} unclear question(s) were discarded automatically.` : ""}` });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader icon={<Sparkles />} title="Draft questions with AI" description="Claude drafts questions from the job's title, seniority, responsibilities, requirements and skills only — never from candidate data. Every draft needs your approval." />
        <DialogBody className="space-y-4">
          {unavailable && <p className="rounded-md bg-warning-soft p-3 text-sm">{unavailable} You can still write questions manually.</p>}
          <Field label="Job" required><Select value={jobId} onValueChange={setJobId} placeholder="Choose a job" options={jobs.map((j) => ({ value: j.id, label: j.title }))} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Questions"><Input type="number" min={3} max={6} value={count} onChange={(e) => setCount(Math.min(6, Math.max(3, Number(e.target.value) || 4)))} /></Field>
            <Field label="Language"><Select value={language} onValueChange={(v) => setLanguage(v as "en" | "el")} options={[{ value: "en", label: "English" }, { value: "el", label: "Ελληνικά" }]} /></Field>
            <Field label="Format"><Select value={mix} onValueChange={(v) => setMix(v as typeof mix)} options={[{ value: "multiple_choice", label: "Multiple choice" }, { value: "mixed", label: "Mostly multiple choice + 1 written" }]} /></Field>
          </div>
          <Field label="Competencies to cover (optional)"><Textarea value={competencies} onChange={(e) => setCompetencies(e.target.value)} rows={2} maxLength={500} placeholder="e.g. data quality checks, stakeholder communication" /></Field>
          {db.ai.model && <p className="text-xs text-muted-foreground">Model: {db.ai.model}. Usage is counted against your company&apos;s monthly AI allowance.</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!jobId || busy || !!unavailable} onClick={run}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}{busy ? "Drafting…" : "Draft questions"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
