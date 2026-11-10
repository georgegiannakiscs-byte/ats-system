"use client";
import { orgPath } from "@/lib/org-path";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BriefcaseBusiness, Ellipsis, Flag, Pencil, Trash2, User } from "lucide-react";
import { Checkbox } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { fullName } from "@/lib/api/selectors";
import { PRIORITY } from "@/lib/constants";
import type { Task } from "@/lib/types";
import { cn, dueLabel } from "@/lib/utils";
import { useUI } from "@/components/shell/ui-context";

export function TaskRow({ task, compact }: { task: Task; compact?: boolean }) {
  const db = useDb();
  const ui = useUI();
  const [confirm, setConfirm] = React.useState(false);
  const overdue = !task.done && new Date(task.dueDate) < new Date();
  const cand = task.candidateId ? db.candidates.find((c) => c.id === task.candidateId) : undefined;
  const job = task.jobId ? db.jobs.find((j) => j.id === task.jobId) : undefined;
  const assignee = db.team.find((m) => m.id === task.assigneeId);
  const toggle = () => {
    api.tasks.toggle(task.id);
    if (!task.done) toast.success("Task completed", { description: task.title, action: { label: "Undo", onClick: () => api.tasks.toggle(task.id) } });
  };
  return (
    <div className={cn("group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/70", task.done && "opacity-60")}>
      <Checkbox checked={task.done} onCheckedChange={toggle} aria-label={task.done ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`} className="mt-0.5 rounded-full" />
      <div className="min-w-0 flex-1">
        <button onClick={() => ui.openTask(task)} className={cn("block w-full truncate text-left text-sm outline-none focus-visible:underline", task.done && "line-through decoration-muted-foreground/60")}>
          {task.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className={cn("tabular", overdue && "font-medium text-destructive")}>{task.done ? "Completed" : dueLabel(task.dueDate)}</span>
          {!compact && task.priority !== "low" && <span className={cn("inline-flex items-center gap-0.5", PRIORITY[task.priority].className)}><Flag className="size-3" />{PRIORITY[task.priority].label}</span>}
          {cand && (
            <button onClick={() => ui.openCandidate(cand.id)} className="inline-flex items-center gap-1 hover:text-foreground"><User className="size-3" />{fullName(cand)}</button>
          )}
          {job && !compact && (
            <Link href={orgPath(`/jobs/view?id=${job.id}`)} className="inline-flex items-center gap-1 hover:text-foreground"><BriefcaseBusiness className="size-3" />{job.title}</Link>
          )}
        </div>
      </div>
      {!compact && assignee && <Avatar name={assignee.name} hue={assignee.hue} size="xs" className="mt-0.5" />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Task actions" className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"><Ellipsis /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => ui.openTask(task)}><Pencil />Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle}>{task.done ? "Mark as open" : "Mark as done"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirm(true)}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this task?" description={task.title} confirmLabel="Delete" destructive onConfirm={() => (api.tasks.remove(task.id), toast("Task deleted"))} />
    </div>
  );
}
