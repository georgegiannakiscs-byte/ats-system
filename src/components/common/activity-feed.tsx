"use client";
import Link from "next/link";
import { ArrowRightLeft, BriefcaseBusiness, CalendarPlus, CircleCheck, ClipboardCheck, Inbox, Mail, MessageSquare, PartyPopper, Pencil, Send, UserX, Library } from "lucide-react";
import { useDb } from "@/lib/api/store";
import type { Activity, ActivityKind, ID } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { fullName } from "@/lib/api/selectors";
import { useUI } from "@/components/shell/ui-context";
import { EmptyState } from "./empty-state";

const icons: Record<ActivityKind, typeof Inbox> = {
  applied: Inbox, stage_changed: ArrowRightLeft, note_added: MessageSquare, interview_scheduled: CalendarPlus, scorecard_submitted: ClipboardCheck, rejected: UserX, hired: PartyPopper,
  job_created: BriefcaseBusiness, job_updated: Pencil, job_published: Send, task_completed: CircleCheck, candidate_updated: Pencil, email_drafted: Mail, talent_pool: Library,
};

export function ActivityFeed({ filter, limit = 40, showContext = false }: { filter?: { candidateId?: ID; jobId?: ID }; limit?: number; showContext?: boolean }) {
  const db = useDb();
  const ui = useUI();
  const items = db.activities.filter((a) => (!filter?.candidateId || a.candidateId === filter.candidateId) && (!filter?.jobId || a.jobId === filter.jobId)).slice(0, limit);
  if (!items.length) return <EmptyState compact icon={<Inbox />} title="No activity yet" />;
  return (
    <ol className="relative">
      {items.map((a, i) => (
        <ActivityRow key={a.id} a={a} last={i === items.length - 1} showContext={showContext} onCandidate={(id) => ui.openCandidate(id)} db={db} />
      ))}
    </ol>
  );
}

function ActivityRow({ a, last, showContext, onCandidate, db }: { a: Activity; last: boolean; showContext: boolean; onCandidate: (id: ID) => void; db: ReturnType<typeof useDb> }) {
  const Icon = icons[a.kind] ?? Inbox;
  const actor = a.actorId ? db.team.find((m) => m.id === a.actorId) : undefined;
  const cand = a.candidateId ? db.candidates.find((c) => c.id === a.candidateId) : undefined;
  const job = a.jobId ? db.jobs.find((j) => j.id === a.jobId) : undefined;
  const tone = a.kind === "hired" ? "text-success" : a.kind === "rejected" ? "text-destructive" : "text-muted-foreground";
  // When there's no actor, the candidate is the subject (e.g. "Léa applied for …").
  const subject = actor ? actor.name : cand ? fullName(cand) : "Someone";
  return (
    <li className="relative flex gap-3 pb-4">
      {!last && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" aria-hidden />}
      <span className={`relative flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface ${tone}`}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-sm">
        <p className="leading-snug text-foreground/85">
          {!actor && cand ? (
            <button onClick={() => onCandidate(cand.id)} className="font-medium text-foreground hover:underline">{subject}</button>
          ) : (
            <span className="font-medium text-foreground">{subject}</span>
          )}{" "}
          {a.message}
        </p>
        <p className="mt-0.5 text-xs text-subtle-foreground">
          {relativeTime(a.createdAt)}
          {showContext && actor && cand && (
            <>
              {" · "}
              <button onClick={() => onCandidate(cand.id)} className="hover:text-foreground hover:underline">{fullName(cand)}</button>
            </>
          )}
          {showContext && job && !a.message.includes(job.title) && (
            <>
              {" · "}
              <Link href={`/jobs/view?id=${job.id}`} className="hover:text-foreground hover:underline">{job.title}</Link>
            </>
          )}
        </p>
      </div>
    </li>
  );
}
