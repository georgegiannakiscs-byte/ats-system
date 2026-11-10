"use client";
import * as React from "react";
import { ClipboardCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { DEFAULT_CRITERIA, SCORE_LABELS } from "@/lib/constants";
import type { ID, Recommendation, ScoreCriterion } from "@/lib/types";
import { fullName } from "@/lib/api/selectors";
import { cn, shortDate } from "@/lib/utils";

export type ScorecardTarget = { interviewId?: ID; candidateId?: ID; jobId?: ID };

export function ScorecardDialog({ target, onClose }: { target: ScorecardTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">{target && <ScorecardForm target={target} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

const RECS: { value: Recommendation; label: string; icon: React.ReactNode; tone: string }[] = [
  { value: "strong_no", label: "Strong no", icon: <><ThumbsDown /><ThumbsDown className="-ml-2.5" /></>, tone: "data-[on=true]:border-destructive data-[on=true]:bg-destructive-soft data-[on=true]:text-destructive" },
  { value: "no", label: "No", icon: <ThumbsDown />, tone: "data-[on=true]:border-destructive/60 data-[on=true]:bg-destructive-soft data-[on=true]:text-destructive" },
  { value: "yes", label: "Yes", icon: <ThumbsUp />, tone: "data-[on=true]:border-success/60 data-[on=true]:bg-success-soft data-[on=true]:text-success" },
  { value: "strong_yes", label: "Strong yes", icon: <><ThumbsUp /><ThumbsUp className="-ml-2.5" /></>, tone: "data-[on=true]:border-success data-[on=true]:bg-success-soft data-[on=true]:text-success" },
];

export function ScoreInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4].map((n) => {
        const on = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${n} — ${SCORE_LABELS[n]}`}
            title={SCORE_LABELS[n]}
            onClick={() => onChange(on ? 0 : n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                onChange(Math.min(4, (value || 0) + 1));
              }
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                onChange(Math.max(1, (value || 2) - 1));
              }
            }}
            className={cn(
              "tabular flex h-8 w-10 items-center justify-center rounded-md border text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-brand bg-brand text-brand-foreground shadow-sm" : value >= n ? "border-brand/30 bg-brand-soft text-brand-soft-foreground" : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function ScorecardForm({ target, onClose }: { target: ScorecardTarget; onClose: () => void }) {
  const db = useDb();
  const interview = target.interviewId ? db.interviews.find((i) => i.id === target.interviewId) : undefined;
  const candidateId = interview?.candidateId ?? target.candidateId!;
  const jobId = interview?.jobId ?? target.jobId ?? db.applications.find((a) => a.candidateId === candidateId)?.jobId ?? "";
  const candidate = db.candidates.find((c) => c.id === candidateId);
  const job = db.jobs.find((j) => j.id === jobId);
  const [criteria, setCriteria] = React.useState<ScoreCriterion[]>(DEFAULT_CRITERIA.map((c) => ({ ...c })));
  const [rec, setRec] = React.useState<Recommendation | null>(null);
  const [summary, setSummary] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const rated = criteria.filter((c) => c.score > 0).length;

  if (!candidate) return null;
  const errors = { rec: !rec ? "Choose an overall recommendation" : undefined, summary: summary.trim().length < 10 ? "Write a short summary (at least 10 characters)" : undefined, criteria: rated < criteria.length ? `Rate all criteria (${rated}/${criteria.length})` : undefined };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.rec || errors.summary || errors.criteria) return;
    await api.scorecards.submit({ interviewId: interview?.id, candidateId, jobId, criteria, recommendation: rec!, summary });
    toast.success("Scorecard submitted", { description: `Thanks — your feedback on ${fullName(candidate)} is now visible to the hiring team.` });
    onClose();
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader icon={<ClipboardCheck />} title="Interview scorecard" description={interview ? `${interview.kind} · ${shortDate(interview.start)}` : "Evaluation"} />
      <DialogBody className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 p-3">
          <Avatar name={fullName(candidate)} hue={candidate.hue} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{fullName(candidate)}</p>
            <p className="truncate text-xs text-muted-foreground">{candidate.headline} · for {job?.title}</p>
          </div>
          <p className="ml-auto hidden text-right text-xs text-muted-foreground sm:block">1 Poor · 2 Fair<br />3 Good · 4 Excellent</p>
        </div>

        <fieldset>
          <legend className="mb-2 flex w-full items-center justify-between text-xs font-medium">
            Criteria
            <span className={cn("tabular font-normal", submitted && errors.criteria ? "text-destructive" : "text-muted-foreground")}>{rated}/{criteria.length} rated</span>
          </legend>
          <div className="divide-y divide-border rounded-lg border border-border">
            {criteria.map((c, idx) => (
              <div key={c.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </div>
                <ScoreInput label={c.label} value={c.score} onChange={(n) => setCriteria((cs) => cs.map((x, i) => (i === idx ? { ...x, score: n } : x)))} />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-medium">Overall recommendation <span className="text-destructive">*</span></legend>
          <div role="radiogroup" aria-label="Overall recommendation" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RECS.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={rec === r.value}
                data-on={rec === r.value}
                onClick={() => setRec(r.value)}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface text-sm font-medium text-muted-foreground transition-all outline-none hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4", r.tone)}
              >
                <span className="flex">{r.icon}</span>
                {r.label}
              </button>
            ))}
          </div>
          {submitted && errors.rec && <p role="alert" className="mt-1.5 text-xs text-destructive">{errors.rec}</p>}
        </fieldset>

        <Field label="Summary" required error={submitted ? errors.summary : undefined} hint="What stood out? What would you want the next interviewer to probe?">
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Strengths, concerns and evidence…" className="min-h-24" aria-invalid={(submitted && !!errors.summary) || undefined} />
        </Field>
      </DialogBody>
      <DialogFooter hint={submitted && errors.criteria ? <span className="text-destructive">{errors.criteria}</span> : "Scorecards are independent — you won't see others' feedback until you submit."}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Submit scorecard</Button>
      </DialogFooter>
    </form>
  );
}
