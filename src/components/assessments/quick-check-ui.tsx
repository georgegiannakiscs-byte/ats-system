"use client";
import * as React from "react";
import { toast } from "sonner";
import { Check, CircleSlash, Clock, Copy, Info, Loader2, Minus, Send, Sparkles, X } from "lucide-react";
import { useCan, useDb } from "@/lib/api/store";
import { api, type QuestionInput } from "@/lib/api";
import type { AssessmentAttempt, AssessmentQuestion, Database, ID, JobAssessmentConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Switch } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { cn, relativeTime } from "@/lib/utils";

/* ───────────── Status ───────────── */
export type QcStatus = "not_invited" | "invited" | "started" | "pending_review" | "completed" | "declined" | "unavailable";
export const QC_LABEL: Record<QcStatus, string> = {
  not_invited: "Not invited", invited: "Invited", started: "Started", pending_review: "Pending human review", completed: "Completed", declined: "Declined", unavailable: "Unavailable",
};
const QC_TONE: Record<QcStatus, "muted" | "neutral" | "brand" | "warning" | "success" | "outline"> = {
  not_invited: "outline", invited: "neutral", started: "brand", pending_review: "warning", completed: "success", declined: "muted", unavailable: "muted",
};

export const DEFAULT_QC: JobAssessmentConfig = { enabled: false, questionIds: [], timed: true, secondsPerQuestion: 30, language: "en", instructions: "", allowLater: true, allowExtendedTime: true, allowUntimed: true, notifyRecruiter: true };

export function latestAttempt(db: Database, applicationId: ID): AssessmentAttempt | undefined {
  return db.assessmentAttempts.filter((a) => a.applicationId === applicationId).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
}

/** A completed check counts as reviewed once a person has written review notes. */
export function qcStatus(db: Database, applicationId: ID, jobId: ID): QcStatus {
  const a = latestAttempt(db, applicationId);
  if (!a) return db.jobAssessments[jobId]?.enabled ? "not_invited" : "unavailable";
  if (a.status === "completed") return a.statusOnly || a.reviewerNotes?.trim() ? "completed" : "pending_review";
  if (a.status === "expired") return "unavailable";
  return a.status;
}

export function QuickCheckChip({ applicationId, jobId, className }: { applicationId: ID; jobId: ID; className?: string }) {
  const db = useDb();
  if (db.org.features.quick_check === false) return null;
  const s = qcStatus(db, applicationId, jobId);
  if (s === "unavailable" && !latestAttempt(db, applicationId)) return null; // job has no Quick Check: keep cards quiet
  return <Badge tone={QC_TONE[s]} className={className} title="Quick Check">QC · {QC_LABEL[s]}</Badge>;
}

/* ───────────── Candidate profile panel ───────────── */
export function CandidateQuickCheck({ applicationId, jobId }: { applicationId: ID; jobId: ID }) {
  const db = useDb();
  const canManage = useCan("assessments.manage");
  const canView = useCan("assessments.view");
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const a = latestAttempt(db, applicationId);
  const status = qcStatus(db, applicationId, jobId);
  const cfg = db.jobAssessments[jobId];
  const approved = cfg?.questionIds.filter((id) => db.assessmentQuestions.find((q) => q.id === id)?.status === "approved").length ?? 0;
  const ready = Boolean(cfg?.enabled && approved >= 3);

  const invite = async (sendEmail: boolean) => {
    setBusy(true);
    try {
      const r = await api.assessments.invite(applicationId, sendEmail);
      setLink(r.url);
      toast.success(sendEmail ? (r.emailDelivery === "sent" ? "Invitation emailed" : "Invitation link created") : "New link created", { description: sendEmail && r.emailDelivery !== "sent" ? "Email delivery isn't configured — copy the link and share it with the candidate." : undefined });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!canView) return <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">Quick Check status: <strong>{QC_LABEL[status]}</strong>. Your role can&apos;t see responses.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-4">
        <Badge tone={QC_TONE[status]} size="md">{QC_LABEL[status]}</Badge>
        {a?.accommodation && a.accommodation !== "none" && <Badge tone="outline" size="md">{a.accommodation === "extended" ? "Extended time" : "Untimed"} (accommodation)</Badge>}
        {a?.completedAt && <span className="text-xs text-muted-foreground">Completed {relativeTime(a.completedAt)}</span>}
        {a?.status === "invited" && a.createdAt && <span className="text-xs text-muted-foreground">Invited {relativeTime(a.createdAt)}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {canManage && ready && a?.status !== "completed" && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => invite(true)}>{busy ? <Loader2 className="animate-spin" /> : <Send />}{a && a.status !== "expired" && a.status !== "declined" ? "Resend invitation" : "Invite to Quick Check"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => invite(false)}><Copy />Get link</Button>
            </>
          )}
          {canManage && a?.id && (a.status === "invited" || a.status === "started") && <Button size="sm" variant="destructive-ghost" onClick={() => api.assessments.revoke(a.id!)}>Revoke link</Button>}
        </div>
      </div>
      {!ready && status !== "completed" && status !== "pending_review" && (
        <p className="flex gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" />Quick Check isn&apos;t enabled for this job. Enable it with 3–4 approved questions in the job&apos;s Quick Check tab.</p>
      )}
      {link && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
          <code className="min-w-0 flex-1 truncate">{link}</code>
          <Button size="sm" variant="outline" onClick={() => (navigator.clipboard.writeText(link), toast.success("Link copied"))}><Copy />Copy</Button>
        </div>
      )}
      {a?.responses && a.responses.length > 0 && <Responses attempt={a} />}
      {a?.id && a.status === "completed" && <ReviewNotes attempt={a} />}
    </div>
  );
}

function Responses({ attempt }: { attempt: AssessmentAttempt }) {
  const db = useDb();
  const canManage = useCan("assessments.manage");
  const [running, setRunning] = React.useState(false);
  const mc = attempt.responses!.filter((r) => r.type === "multiple_choice");
  const matched = mc.filter((r) => r.isCorrect).length;
  const hasWritten = attempt.responses!.some((r) => r.type === "short_text" && r.answerText);
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
        {mc.length > 0 && <p><strong className="text-foreground">{matched} of {mc.length}</strong> multiple-choice answers match the approved answer key (checked automatically, without AI).</p>}
        <p className="mt-1">Quick Check is limited evidence. Review it alongside the CV and interviews — it never moves or rejects a candidate on its own. Response speed is not shown or scored.</p>
      </div>
      {attempt.responses!.map((r) => {
        const chosen = r.options.find((o) => o.id === r.answerOptionId);
        return (
          <div key={r.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start gap-2">
              <span className="tabular mt-0.5 text-xs text-muted-foreground">{r.position + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-relaxed">{r.questionText}</p>
                {r.competency && <p className="mt-0.5 text-xs text-muted-foreground">{r.competency}</p>}
                {r.type === "multiple_choice" ? (
                  <ul className="mt-3 space-y-1 text-sm">
                    {r.options.map((o) => (
                      <li key={o.id} className={cn("flex items-start gap-2 rounded px-2 py-1", o.id === r.answerOptionId && "bg-accent")}>
                        <span className="w-4 font-medium text-muted-foreground">{o.id}</span>
                        <span className="flex-1">{o.text}</span>
                        {o.id === r.correctOptionId && <span className="text-xs text-success">answer key</span>}
                        {o.id === r.answerOptionId && <span className="text-xs text-muted-foreground">chosen</span>}
                      </li>
                    ))}
                  </ul>
                ) : r.answerText ? (
                  <p className="mt-3 whitespace-pre-line rounded-md bg-surface-2 p-3 text-sm">{r.answerText}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {!r.answered ? (
                    <Badge tone="muted">{r.timedOut ? <Clock /> : <Minus />}{r.timedOut ? "Unanswered (time ran out)" : "Skipped"}</Badge>
                  ) : r.type === "multiple_choice" ? (
                    r.isCorrect ? <Badge tone="success"><Check />Matches key</Badge> : <Badge tone="neutral"><X />Differs from key{chosen ? "" : ""}</Badge>
                  ) : <Badge tone="outline">Written answer — for human review</Badge>}
                  {r.explanation && <span className="text-muted-foreground">Reviewer note: {r.explanation}</span>}
                </div>
                {r.observation && (
                  <div className="mt-3 rounded-md border border-signal/30 bg-signal-soft/40 p-3 text-xs">
                    <p className="flex items-center gap-1 font-medium"><Sparkles className="size-3.5 text-signal" />AI observations — descriptive only, not a score</p>
                    {r.observation.relevant_concepts.length > 0 && <p className="mt-1.5"><span className="text-muted-foreground">Concepts mentioned:</span> {r.observation.relevant_concepts.join(", ")}</p>}
                    {r.observation.areas_to_clarify.length > 0 && <p className="mt-1"><span className="text-muted-foreground">Could clarify:</span> {r.observation.areas_to_clarify.join("; ")}</p>}
                    {r.observation.follow_up_questions.length > 0 && <ul className="mt-1 list-disc pl-4">{r.observation.follow_up_questions.map((f) => <li key={f}>{f}</li>)}</ul>}
                    <p className="mt-1.5 text-muted-foreground">{r.observation.model} · {r.observation.promptVersion}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {hasWritten && canManage && db.org.features.ai_assessment_observations && (
        <Button size="sm" variant="outline" disabled={running} onClick={async () => { setRunning(true); try { await api.assessments.observe(attempt.id!); toast.success("Observations updated"); } catch (e) { toast.error((e as Error).message); } finally { setRunning(false); } }}>
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />}{attempt.aiStatus === "done" ? "Re-run AI observations" : "Generate AI observations"}
        </Button>
      )}
      {attempt.aiStatus === "failed" && <p className="text-xs text-muted-foreground">AI observations couldn&apos;t be generated. The responses above are unaffected.</p>}
    </div>
  );
}

function ReviewNotes({ attempt }: { attempt: AssessmentAttempt }) {
  const [notes, setNotes] = React.useState(attempt.reviewerNotes ?? "");
  const [saving, setSaving] = React.useState(false);
  return (
    <Field label="Reviewer notes" hint="Adding notes marks the Quick Check as reviewed by a person.">
      <div className="space-y-2">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What did you take from these answers? What will you ask in the interview?" />
        <Button size="sm" disabled={saving || notes === (attempt.reviewerNotes ?? "")} onClick={async () => { setSaving(true); try { await api.assessments.saveNotes(attempt.id!, notes); toast.success("Notes saved"); } finally { setSaving(false); } }}>Save notes</Button>
      </div>
    </Field>
  );
}

/* ───────────── Job settings ───────────── */
export function JobQuickCheckSettings({ jobId }: { jobId: ID }) {
  const db = useDb();
  const canManage = useCan("assessments.manage");
  const saved = db.jobAssessments[jobId] ?? DEFAULT_QC;
  const [cfg, setCfg] = React.useState<JobAssessmentConfig>(saved);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setCfg(db.jobAssessments[jobId] ?? DEFAULT_QC), [db.jobAssessments, jobId]);
  const approved = db.assessmentQuestions.filter((q) => q.status === "approved");
  const forJob = approved.filter((q) => !q.jobId || q.jobId === jobId);
  const selected = cfg.questionIds.map((id) => db.assessmentQuestions.find((q) => q.id === id)).filter(Boolean) as AssessmentQuestion[];
  const invalid = cfg.enabled && (selected.length < 3 || selected.length > 4 || selected.some((q) => q.status !== "approved"));
  const set = (p: Partial<JobAssessmentConfig>) => setCfg((c) => ({ ...c, ...p }));
  const toggle = (id: ID) => set({ questionIds: cfg.questionIds.includes(id) ? cfg.questionIds.filter((x) => x !== id) : cfg.questionIds.length >= 4 ? cfg.questionIds : [...cfg.questionIds, id] });
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  if (db.org.features.quick_check === false) return <p className="p-6 text-sm text-muted-foreground">Quick Check isn&apos;t enabled for this company.</p>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-6 animate-fade-in">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
        <Switch checked={cfg.enabled} onCheckedChange={(v) => set({ enabled: v })} disabled={!canManage} aria-label="Enable Quick Check" />
        <div className="flex-1">
          <p className="text-sm font-medium">Offer a Quick Check after applying</p>
          <p className="text-xs text-muted-foreground">Candidates see 3–4 approved, role-related questions after submitting. It&apos;s optional for them, and never affects whether their application is received.</p>
        </div>
      </div>
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Questions <span className="tabular font-normal text-muted-foreground">{cfg.questionIds.length}/4</span></h3>
          <span className="text-xs text-muted-foreground">Only approved questions can be used</span>
        </div>
        {forJob.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No approved questions yet. Create or generate them in Assessments, then approve them.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {forJob.map((q) => (
              <li key={q.id} className="flex items-start gap-3 py-2.5">
                <input type="checkbox" className="mt-1" checked={cfg.questionIds.includes(q.id)} disabled={!canManage || (!cfg.questionIds.includes(q.id) && cfg.questionIds.length >= 4)} onChange={() => toggle(q.id)} aria-label={`Use question: ${q.questionText}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{q.questionText}</p>
                  <p className="text-xs text-muted-foreground">{q.competency || "General"} · {q.type === "multiple_choice" ? "Multiple choice" : "Short written"} · {q.language.toUpperCase()} · v{q.version}{q.source === "ai" ? " · AI-drafted, approved" : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {invalid && <p className="mt-2 text-xs text-destructive">Choose 3–4 approved questions to enable Quick Check.</p>}
      </section>
      <section className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm"><Switch checked={cfg.timed} onCheckedChange={(v) => set({ timed: v })} disabled={!canManage} />Timed questions</label>
        <Field label="Seconds per question">
          <Input type="number" min={20} max={60} value={cfg.secondsPerQuestion} disabled={!cfg.timed || !canManage} onChange={(e) => set({ secondsPerQuestion: Math.min(60, Math.max(20, Number(e.target.value) || 30)) })} />
        </Field>
        <Field label="Language">
          <Select value={cfg.language} onValueChange={(v) => set({ language: v as "en" | "el" })} options={[{ value: "en", label: "English" }, { value: "el", label: "Ελληνικά" }]} />
        </Field>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><Switch checked={cfg.allowLater} onCheckedChange={(v) => set({ allowLater: v })} disabled={!canManage} />Email a link to complete later</label>
          <label className="flex items-center gap-2"><Switch checked={cfg.allowExtendedTime} onCheckedChange={(v) => set({ allowExtendedTime: v })} disabled={!canManage} />Offer extended time (2×)</label>
          <label className="flex items-center gap-2"><Switch checked={cfg.allowUntimed} onCheckedChange={(v) => set({ allowUntimed: v })} disabled={!canManage} />Offer untimed mode</label>
          <label className="flex items-center gap-2"><Switch checked={cfg.notifyRecruiter} onCheckedChange={(v) => set({ notifyRecruiter: v })} disabled={!canManage} />Notify the recruiter on completion</label>
        </div>
        <div className="sm:col-span-2">
          <Field label="Instructions for candidates (optional)">
            <Textarea value={cfg.instructions} onChange={(e) => set({ instructions: e.target.value })} rows={2} maxLength={1000} disabled={!canManage} placeholder="e.g. Answer as you would on a normal working day. There are no trick questions." />
          </Field>
        </div>
        {!cfg.allowExtendedTime && !cfg.allowUntimed && cfg.timed && <p className="text-xs text-warning sm:col-span-2">Without extended or untimed options, candidates who need adjustments must contact you. We recommend keeping at least one on.</p>}
      </section>
      {canManage && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={!dirty} onClick={() => setCfg(saved)}>Discard</Button>
          <Button disabled={!dirty || invalid || saving} onClick={async () => { setSaving(true); try { await api.assessments.saveJobConfig(jobId, cfg); toast.success("Quick Check settings saved"); } catch {} finally { setSaving(false); } }}>Save</Button>
        </div>
      )}
    </div>
  );
}

/* ───────────── Question editor ───────────── */
const BLANK: QuestionInput = { questionText: "", type: "multiple_choice", options: ["A", "B", "C", "D"].map((id) => ({ id, text: "" })), correctOptionId: null, explanation: "", competency: "", difficulty: "medium", recommendedTimeSeconds: 30, language: "en", jobId: null };

export function QuestionDialog({ open, onOpenChange, question }: { open: boolean; onOpenChange: (v: boolean) => void; question?: AssessmentQuestion | null }) {
  const db = useDb();
  const [v, setV] = React.useState<QuestionInput>(BLANK);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (open) setV(question ? { questionText: question.questionText, type: question.type, options: question.options.length ? question.options : BLANK.options, correctOptionId: question.correctOptionId, explanation: question.explanation, competency: question.competency, difficulty: question.difficulty, recommendedTimeSeconds: question.recommendedTimeSeconds, language: question.language, jobId: question.jobId ?? null } : BLANK);
  }, [open, question]);
  const set = (p: Partial<QuestionInput>) => setV((x) => ({ ...x, ...p }));
  const filled = v.options.filter((o) => o.text.trim());
  const problem = v.questionText.trim().length < 15 ? "Write the scenario (at least 15 characters)." : v.type === "multiple_choice" && filled.length < 3 ? "Add at least 3 options." : v.type === "multiple_choice" && (!v.correctOptionId || !filled.some((o) => o.id === v.correctOptionId)) ? "Choose the answer key." : null;
  const save = async () => {
    setSaving(true);
    try {
      await api.assessments.saveQuestion(question?.id ?? null, { ...v, options: v.type === "multiple_choice" ? filled : [] });
      toast.success(question ? "Saved as a new draft version — approve it again to use it" : "Draft saved");
      onOpenChange(false);
    } catch {} finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={question ? `Edit question (v${question.version})` : "New question"} description="Practical, job-related scenarios work best. Avoid trivia and anything about personal characteristics." />
        <DialogBody className="space-y-4">
          <Field label="Question" required><Textarea value={v.questionText} onChange={(e) => set({ questionText: e.target.value })} rows={3} maxLength={600} placeholder="Yesterday's conversions dropped 60% while traffic was flat. What do you check first?" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type"><Select value={v.type} onValueChange={(t) => set({ type: t as QuestionInput["type"] })} options={[{ value: "multiple_choice", label: "Multiple choice" }, { value: "short_text", label: "Short written answer" }]} /></Field>
            <Field label="Language"><Select value={v.language} onValueChange={(t) => set({ language: t as "en" | "el" })} options={[{ value: "en", label: "English" }, { value: "el", label: "Ελληνικά" }]} /></Field>
            <Field label="Difficulty"><Select value={v.difficulty} onValueChange={(t) => set({ difficulty: t as QuestionInput["difficulty"] })} options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} /></Field>
            <Field label="Competency"><Input value={v.competency} onChange={(e) => set({ competency: e.target.value })} maxLength={120} placeholder="Data quality" /></Field>
            <Field label="Job (optional)"><Select value={v.jobId ?? "any"} onValueChange={(t) => set({ jobId: t === "any" ? null : t })} options={[{ value: "any", label: "Any job" }, ...db.jobs.map((j) => ({ value: j.id, label: j.title }))]} /></Field>
            <Field label="Suggested seconds"><Input type="number" min={20} max={120} value={v.recommendedTimeSeconds} onChange={(e) => set({ recommendedTimeSeconds: Math.min(120, Math.max(20, Number(e.target.value) || 30)) })} /></Field>
          </div>
          {v.type === "multiple_choice" ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Options — select the answer key</legend>
              {v.options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input type="radio" name="key" aria-label={`Option ${o.id} is the answer key`} checked={v.correctOptionId === o.id} onChange={() => set({ correctOptionId: o.id })} />
                  <span className="w-4 text-sm font-medium text-muted-foreground">{o.id}</span>
                  <Input value={o.text} maxLength={300} onChange={(e) => set({ options: v.options.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
                  {v.options.length > 3 && <Button size="icon-sm" variant="ghost" aria-label={`Remove option ${o.id}`} onClick={() => set({ options: v.options.filter((_, k) => k !== i).map((x, k) => ({ ...x, id: "ABCDEF"[k] })), correctOptionId: null })}><X /></Button>}
                </div>
              ))}
              {v.options.length < 6 && <Button size="sm" variant="ghost" onClick={() => set({ options: [...v.options, { id: "ABCDEF"[v.options.length], text: "" }] })}>Add option</Button>}
            </fieldset>
          ) : null}
          <Field label={v.type === "multiple_choice" ? "Why the key is best (shown to reviewers only)" : "What a strong answer covers (shown to reviewers only)"}><Textarea value={v.explanation} onChange={(e) => set({ explanation: e.target.value })} rows={2} maxLength={1500} /></Field>
          {question?.status === "approved" && <p className="flex gap-2 text-xs text-muted-foreground"><CircleSlash className="mt-0.5 size-3.5" />Saving creates a new version as a draft. Candidates who already took the check keep the version they saw.</p>}
        </DialogBody>
        <DialogFooter hint={problem ?? undefined}>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!!problem || saving} onClick={save}>{saving && <Loader2 className="animate-spin" />}Save draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
