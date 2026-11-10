"use client";
import { Badge, StatusDot } from "@/components/ui/badge";
import { EVALUATION, JOB_STATUS, STAGE_TONE } from "@/lib/constants";
import type { ApplicationStatus, Evaluation, JobStatus, StageId } from "@/lib/types";
import { useDb } from "@/lib/api/store";
import { cn } from "@/lib/utils";
import { CircleCheck, CircleDashed, CircleMinus, CircleX, CircleDot } from "lucide-react";

export function useStageLabel() {
  const db = useDb();
  return (id: StageId) => db.stages.find((s) => s.id === id)?.label ?? id;
}

export function StageBadge({ stage, status, className }: { stage: StageId; status?: ApplicationStatus; className?: string }) {
  const label = useStageLabel();
  if (status === "rejected") return <Badge tone="danger" className={className}>Rejected</Badge>;
  if (status === "withdrawn") return <Badge tone="muted" className={className}>Withdrawn</Badge>;
  return <StatusDot className={className} color={STAGE_TONE[stage]} label={label(stage)} />;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const s = JOB_STATUS[status];
  const color = { success: "var(--success)", neutral: "var(--subtle-foreground)", warning: "var(--warning)", muted: "var(--border-strong)" }[s.tone];
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-[5px] border border-border bg-surface px-1.5 text-[11px] font-medium text-foreground/80">
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {s.label}
    </span>
  );
}

const evalIcon: Record<Evaluation, typeof CircleCheck> = { none: CircleDashed, pending: CircleDot, positive: CircleCheck, mixed: CircleMinus, negative: CircleX };
const evalColor: Record<Evaluation, string> = { none: "text-subtle-foreground", pending: "text-warning", positive: "text-success", mixed: "text-muted-foreground", negative: "text-destructive" };

export function EvaluationBadge({ value, compact, className }: { value: Evaluation; compact?: boolean; className?: string }) {
  const Icon = evalIcon[value];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)} title={EVALUATION[value].label}>
      <Icon className={cn("size-3.5 shrink-0", evalColor[value])} aria-hidden />
      {compact ? <span className="sr-only">{EVALUATION[value].label}</span> : EVALUATION[value].label}
    </span>
  );
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-[18px] items-center rounded-[4px] bg-muted px-1.5 text-[11px] font-medium text-muted-foreground", className)}>{children}</span>;
}
