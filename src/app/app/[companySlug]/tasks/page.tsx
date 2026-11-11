"use client";
import { orgPath } from "@/lib/org-path";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { CircleCheck, Flag, ListChecks, Plus, Users, CornerDownLeft } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { usePageMeta } from "@/components/shell/page-meta";
import { useUI } from "@/components/shell/ui-context";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { FilterMenu } from "@/components/common/filter-menu";
import { SearchInput } from "@/components/common/search-input";
import { EmptyState } from "@/components/common/empty-state";
import { TaskRow } from "@/components/tasks/task-row";
import { PRIORITY } from "@/lib/constants";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

type View = "mine" | "overdue" | "upcoming" | "completed" | "team";
const VIEWS: { id: View; label: string }[] = [
  { id: "mine", label: "My tasks" },
  { id: "overdue", label: "Overdue" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "team", label: "All team" },
];

export default function TasksPage() {
  return (
    <React.Suspense>
      <Tasks />
    </React.Suspense>
  );
}

function bucket(t: Task) {
  const d = differenceInCalendarDays(new Date(t.dueDate), new Date());
  if (new Date(t.dueDate) < new Date() && d <= 0) return d < 0 ? "Overdue" : "Today";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 7) return "This week";
  return "Later";
}
const BUCKETS = ["Overdue", "Today", "Tomorrow", "This week", "Later"];

function Tasks() {
  const db = useDb();
  const ui = useUI();
  const router = useRouter();
  const sp = useSearchParams();
  usePageMeta("Tasks");
  const view = (VIEWS.some((v) => v.id === sp.get("view")) ? sp.get("view") : "mine") as View;
  const setView = (v: string) => router.replace(v === "mine" ? orgPath("/tasks") : orgPath(`/tasks?view=${v}`), { scroll: false });
  const [q, setQ] = React.useState("");
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [priorities, setPriorities] = React.useState<string[]>([]);
  const [quick, setQuick] = React.useState("");
  const now = new Date();
  const me = db.currentUserId;

  const inView = (t: Task, v: View) => {
    if (v === "mine") return !t.done && t.assigneeId === me;
    if (v === "overdue") return !t.done && new Date(t.dueDate) < now && t.assigneeId === me;
    if (v === "upcoming") return !t.done && new Date(t.dueDate) >= now && t.assigneeId === me;
    if (v === "completed") return t.done;
    return !t.done;
  };
  const query = q.toLowerCase().trim();
  const tasks = db.tasks
    .filter((t) => inView(t, view))
    .filter((t) => (!assignees.length || assignees.includes(t.assigneeId)) && (!priorities.length || priorities.includes(t.priority)) && (!query || `${t.title} ${t.description ?? ""}`.toLowerCase().includes(query)))
    .sort((a, b) => (view === "completed" ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : a.dueDate.localeCompare(b.dueDate)));

  const grouped = view === "completed" ? { Completed: tasks } : tasks.reduce<Record<string, Task[]>>((acc, t) => ((acc[bucket(t)] ??= []).push(t), acc), {});
  const order = view === "completed" ? ["Completed"] : BUCKETS;

  const addQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quick.trim().length < 3) return;
    const due = new Date();
    due.setDate(due.getDate() + 1);
    due.setHours(17, 0, 0, 0);
    await api.tasks.create({ title: quick.trim(), dueDate: due.toISOString(), assigneeId: me, priority: "medium" });
    toast.success("Task added for tomorrow", { description: "Open it to add details or a due time." });
    setQuick("");
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v.id} value={v.id} count={db.tasks.filter((t) => inView(t, v.id)).length} className={cn(v.id === "overdue" && db.tasks.some((t) => inView(t, "overdue")) && "[&>span]:bg-destructive-soft [&>span]:text-destructive")}>{v.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 py-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search tasks" />
        {view === "team" || view === "completed" ? <FilterMenu label="Assignee" icon={<Users />} options={db.team.map((m) => ({ value: m.id, label: m.name }))} selected={assignees} onChange={setAssignees} /> : null}
        <FilterMenu label="Priority" icon={<Flag />} options={(["high", "medium", "low"] as const).map((p) => ({ value: p, label: PRIORITY[p].label }))} selected={priorities} onChange={setPriorities} />
        <Button size="sm" className="ml-auto" onClick={() => ui.openTask()}><Plus />New task</Button>
      </div>

      {view !== "completed" && (
        <form onSubmit={addQuick} className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-3 transition-colors focus-within:border-solid focus-within:border-brand/50 focus-within:ring-[3px] focus-within:ring-ring/40">
          <Plus className="size-4 text-subtle-foreground" />
          <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add - type a task and press Enter" aria-label="Quick add task" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground" />
          {quick && <span className="flex items-center gap-1 text-[11px] text-subtle-foreground"><Kbd><CornerDownLeft className="size-2.5" /></Kbd> due tomorrow</span>}
        </form>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-xs">
          <EmptyState
            icon={view === "completed" ? <ListChecks /> : <CircleCheck />}
            title={view === "overdue" ? "Nothing overdue" : view === "completed" ? "No completed tasks yet" : "You're all caught up"}
            description={view === "overdue" ? "Every task is on schedule. Lovely." : "Create tasks to keep follow-ups from slipping."}
            action={view !== "completed" ? <Button size="sm" variant="outline" onClick={() => ui.openTask()}><Plus />New task</Button> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {order.filter((b) => grouped[b]?.length).map((b) => (
            <section key={b}>
              <h3 className={cn("mb-1.5 flex items-center gap-2 px-2 text-xs font-medium", b === "Overdue" ? "text-destructive" : "text-muted-foreground")}>
                {b}<span className="tabular text-subtle-foreground">{grouped[b].length}</span>
              </h3>
              <div className="rounded-xl border border-border bg-surface p-1 shadow-xs">
                {grouped[b].map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
