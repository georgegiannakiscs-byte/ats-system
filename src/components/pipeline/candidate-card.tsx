"use client";
import * as React from "react";
import { ArrowRight, CalendarPlus, Ellipsis, Mail, UserX, Clock, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/overlays";
import { EvaluationBadge, Tag } from "@/components/common/badges";
import { QuickCheckChip } from "@/components/assessments/quick-check-ui";
import type { Application, Candidate, StageConfig, TeamMember } from "@/lib/types";
import { cn, daysSince, shortDate } from "@/lib/utils";
import { fullName } from "@/lib/api/selectors";
import { STAGE_ORDER } from "@/lib/constants";

export interface CardData {
  app: Application;
  candidate: Candidate;
  recruiter?: TeamMember;
  stage: StageConfig;
  notes: number;
  nextInterview?: string;
}

/** Compact pipeline card. Pure presentation — drag behaviour is added by the board. */
export function CandidateCard({
  data, dragging, overlay, onOpen, onAdvance, onSchedule, onEmail, onReject, handleProps,
}: {
  data: CardData; dragging?: boolean; overlay?: boolean; onOpen?: () => void; onAdvance?: () => void; onSchedule?: () => void; onEmail?: () => void; onReject?: () => void;
  handleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const { app, candidate, recruiter, stage } = data;
  const days = daysSince(app.stageEnteredAt);
  const late = stage.slaDays > 0 && days > stage.slaDays;
  const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(app.stage) + 1];
  return (
    <div
      {...handleProps}
      onClick={onOpen}
      onKeyDown={(e) => {
        handleProps?.onKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) onOpen?.();
      }}
      className={cn(
        "group/card relative select-none rounded-lg border border-border bg-surface p-2.5 text-left shadow-xs outline-none transition-[box-shadow,border-color,opacity,transform] duration-150",
        "hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
        dragging && "opacity-40 shadow-none",
        overlay && "rotate-[1.5deg] cursor-grabbing border-signal/50 shadow-drag",
        !overlay && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-2">
        <Avatar name={fullName(candidate)} hue={candidate.hue} size="sm" className="mt-px" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight">{fullName(candidate)}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{candidate.headline}{candidate.currentCompany ? ` · ${candidate.currentCompany}` : ""}</p>
        </div>
      </div>

      {candidate.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {candidate.tags.slice(0, 2).map((t) => <Tag key={t}>{t}</Tag>)}
          {candidate.tags.length > 2 && <Tag>+{candidate.tags.length - 2}</Tag>}
        </div>
      )}

      <QuickCheckChip applicationId={app.id} jobId={app.jobId} className="mt-2" />
      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <EvaluationBadge value={app.evaluation} compact />
        <Tooltip content={`Applied ${shortDate(app.appliedAt)} · ${days}d in ${stage.label}${late ? ` (target ${stage.slaDays}d)` : ""}`}>
          <span className={cn("tabular inline-flex items-center gap-1", late && "text-warning")}><Clock className="size-3" />{days === 0 ? "Today" : `${days}d`}</span>
        </Tooltip>
        {data.notes > 0 && <span className="tabular inline-flex items-center gap-1" title={`${data.notes} notes`}><MessageSquare className="size-3" />{data.notes}</span>}
        {data.nextInterview && <span className="inline-flex items-center gap-1 text-brand" title="Next interview"><CalendarPlus className="size-3" />{data.nextInterview}</span>}
        <span className="ml-auto">{recruiter && <Avatar name={recruiter.name} hue={recruiter.hue} size="xs" />}</span>
      </div>

      {!overlay && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-surface/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {nextStage && onAdvance && (
            <Tooltip content="Advance to next stage">
              <Button variant="ghost" size="icon-xs" aria-label={`Advance ${fullName(candidate)} to next stage`} onClick={onAdvance}><ArrowRight /></Button>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${fullName(candidate)}`}><Ellipsis /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuItem onSelect={onOpen}>Open preview</DropdownMenuItem>
              <DropdownMenuItem onSelect={onSchedule}><CalendarPlus />Schedule interview</DropdownMenuItem>
              <DropdownMenuItem onSelect={onEmail}><Mail />Send email</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={onReject}><UserX />Reject</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
