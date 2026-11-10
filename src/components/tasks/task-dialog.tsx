"use client";
import * as React from "react";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { CandidatePicker, JobPicker, TeamPicker } from "@/components/common/pickers";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import type { ID, Task, TaskPriority } from "@/lib/types";

export type TaskPrefill = { candidateId?: ID; jobId?: ID; title?: string };

export function TaskDialog({ prefill, onClose }: { prefill: TaskPrefill | Task | null; onClose: () => void }) {
  return (
    <Dialog open={!!prefill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{prefill && <TaskForm prefill={prefill} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function TaskForm({ prefill, onClose }: { prefill: TaskPrefill | Task; onClose: () => void }) {
  const db = useDb();
  const editing = "id" in prefill ? (prefill as Task) : null;
  const [title, setTitle] = React.useState(editing?.title ?? prefill.title ?? "");
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [due, setDue] = React.useState(format(editing ? new Date(editing.dueDate) : new Date(Date.now() + 864e5), "yyyy-MM-dd"));
  const [time, setTime] = React.useState(format(editing ? new Date(editing.dueDate) : new Date(new Date().setHours(17, 0, 0, 0)), "HH:mm"));
  const [assignee, setAssignee] = React.useState<ID[]>([editing?.assigneeId ?? db.currentUserId]);
  const [priority, setPriority] = React.useState<TaskPriority>(editing?.priority ?? "medium");
  const [candidateId, setCandidateId] = React.useState<ID | undefined>(prefill.candidateId);
  const [jobId, setJobId] = React.useState<ID | undefined>(prefill.jobId ?? (prefill.candidateId ? db.applications.find((a) => a.candidateId === prefill.candidateId)?.jobId : undefined));
  const [submitted, setSubmitted] = React.useState(false);
  const errors = { title: title.trim().length < 3 ? "Give the task a short title" : undefined, assignee: !assignee[0] ? "Assign the task to someone" : undefined };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.title || errors.assignee) return;
    const payload = { title: title.trim(), description: description || undefined, dueDate: new Date(`${due}T${time || "17:00"}`).toISOString(), assigneeId: assignee[0], priority, candidateId, jobId };
    if (editing) {
      await api.tasks.update(editing.id, payload);
      toast.success("Task updated");
    } else {
      await api.tasks.create(payload);
      toast.success("Task created", { description: title });
    }
    onClose();
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader icon={<ListChecks />} title={editing ? "Edit task" : "New task"} description="Keep follow-ups visible to the team." />
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required error={submitted ? errors.title : undefined} className="sm:col-span-2">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send case study to Léa" aria-invalid={(submitted && !!errors.title) || undefined} />
        </Field>
        <Field label="Details" className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context" className="min-h-16" />
        </Field>
        <Field label="Due date">
          <div className="flex gap-2">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
          </div>
        </Field>
        <Field label="Priority">
          <Segmented ariaLabel="Priority" value={priority} onChange={setPriority} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
        </Field>
        <Field label="Assignee" required error={submitted ? errors.assignee : undefined} className="sm:col-span-2">
          <TeamPicker value={assignee} onChange={(v) => setAssignee(v.slice(-1))} />
        </Field>
        <Field label="Related candidate">
          <CandidatePicker value={candidateId} onChange={setCandidateId} />
        </Field>
        <Field label="Related job">
          <JobPicker value={jobId} onChange={setJobId} placeholder="None" />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">{editing ? "Save changes" : "Create task"}</Button>
      </DialogFooter>
    </form>
  );
}
