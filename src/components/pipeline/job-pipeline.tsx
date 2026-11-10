"use client";
import { BRAND } from "@/config/brand";
import * as React from "react";
import { Kanban, Rows3, UserPlus, Users, Tag as TagIcon, CircleCheck, Globe, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { useDb } from "@/lib/api/store";
import { STAGE_ORDER, EVALUATION, SOURCES } from "@/lib/constants";
import type { Evaluation, ID, StageId } from "@/lib/types";
import { cn, daysSince, shortDate } from "@/lib/utils";
import { fullName } from "@/lib/api/selectors";
import { moveStage } from "@/lib/hooks/use-stage-actions";
import { useUI } from "@/components/shell/ui-context";
import { Button } from "@/components/ui/button";
import { Segmented, Select, Checkbox } from "@/components/ui/controls";
import { Avatar } from "@/components/ui/avatar";
import { SearchInput } from "@/components/common/search-input";
import { FilterMenu } from "@/components/common/filter-menu";
import { EvaluationBadge, Tag } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { KanbanBoard } from "./kanban-board";
import type { CardData } from "./candidate-card";
import { api } from "@/lib/api";

const VIEW_KEY = `${BRAND.slug}.ui.pipeline-view`;

export function JobPipeline({ jobId }: { jobId: ID }) {
  const db = useDb();
  const ui = useUI();
  const [view, setView] = React.useState<"kanban" | "table">("kanban");
  const [q, setQ] = React.useState("");
  const [recruiters, setRecruiters] = React.useState<string[]>([]);
  const [evals, setEvals] = React.useState<string[]>([]);
  const [tags, setTags] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState<string[]>([]);

  React.useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "table" || v === "kanban") setView(v);
    } catch {}
  }, []);
  const changeView = (v: "kanban" | "table") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const allCards = React.useMemo<CardData[]>(() => {
    const now = Date.now();
    return db.applications
      .filter((a) => a.jobId === jobId && a.status !== "rejected" && a.status !== "withdrawn")
      .map((app) => {
        const candidate = db.candidates.find((c) => c.id === app.candidateId)!;
        const next = db.interviews.filter((i) => i.applicationId === app.id && i.status === "scheduled" && new Date(i.start).getTime() > now).sort((a, b) => a.start.localeCompare(b.start))[0];
        return {
          app,
          candidate,
          recruiter: db.team.find((m) => m.id === app.recruiterId),
          stage: db.stages.find((s) => s.id === app.stage)!,
          notes: db.notes.filter((n) => n.candidateId === app.candidateId).length,
          nextInterview: next ? new Date(next.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : undefined,
        };
      });
  }, [db, jobId]);

  const query = q.trim().toLowerCase();
  const cards = allCards.filter(
    (c) =>
      (!query || `${fullName(c.candidate)} ${c.candidate.headline} ${c.candidate.currentCompany} ${c.candidate.tags.join(" ")} ${c.candidate.skills.join(" ")}`.toLowerCase().includes(query)) &&
      (!recruiters.length || recruiters.includes(c.app.recruiterId)) &&
      (!evals.length || evals.includes(c.app.evaluation)) &&
      (!sources.length || sources.includes(c.candidate.source)) &&
      (!tags.length || tags.some((t) => c.candidate.tags.includes(t))),
  );
  const filtered = cards.length !== allCards.length;
  const allTags = Array.from(new Set(allCards.flatMap((c) => c.candidate.tags))).sort();
  const recruiterIds = Array.from(new Set(allCards.map((c) => c.app.recruiterId)));
  const clear = () => (setQ(""), setRecruiters([]), setEvals([]), setTags([]), setSources([]));

  const active = allCards.filter((c) => c.app.status === "active");
  const stale = active.filter((c) => c.stage.slaDays > 0 && daysSince(c.app.stageEnteredAt) > c.stage.slaDays).length;
  const pending = active.filter((c) => c.app.evaluation === "pending").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <SearchInput value={q} onChange={setQ} placeholder="Search this pipeline" className="sm:w-56" />
        <FilterMenu label="Recruiter" icon={<Users />} options={recruiterIds.map((id) => ({ value: id, label: db.team.find((m) => m.id === id)?.name ?? id }))} selected={recruiters} onChange={setRecruiters} />
        <FilterMenu label="Evaluation" icon={<CircleCheck />} options={(Object.keys(EVALUATION) as Evaluation[]).map((e) => ({ value: e, label: EVALUATION[e].label, count: allCards.filter((c) => c.app.evaluation === e).length }))} selected={evals} onChange={setEvals} />
        <FilterMenu label="Source" icon={<Globe />} options={SOURCES.map((s) => ({ value: s, label: s, count: allCards.filter((c) => c.candidate.source === s).length }))} selected={sources} onChange={setSources} />
        {allTags.length > 0 && <FilterMenu label="Tags" icon={<TagIcon />} searchable options={allTags.map((t) => ({ value: t, label: t }))} selected={tags} onChange={setTags} />}
        {filtered && <Button variant="ghost" size="sm" onClick={clear}>Clear</Button>}
        <div className="ml-auto flex items-center gap-2">
          <p className="hidden text-xs text-muted-foreground xl:block">
            <span className="tabular font-medium text-foreground">{active.length}</span> active
            {stale > 0 && <> · <span className="tabular font-medium text-warning">{stale}</span> past target</>}
            {pending > 0 && <> · <span className="tabular font-medium text-foreground">{pending}</span> awaiting feedback</>}
          </p>
          <Segmented ariaLabel="Pipeline view" value={view} onChange={changeView} options={[{ value: "kanban", icon: <Kanban />, label: "Board" }, { value: "table", icon: <Rows3 />, label: "Table" }]} />
          <Button size="sm" onClick={() => ui.addCandidate(jobId)}><UserPlus />Add candidate</Button>
        </div>
      </div>

      {allCards.length === 0 ? (
        <EmptyState icon={<Users />} title="No candidates yet" description="Publish the job or add candidates you've sourced to start building this pipeline." action={<Button size="sm" onClick={() => ui.addCandidate(jobId)}><UserPlus />Add candidate</Button>} />
      ) : view === "kanban" ? (
        <>
          {filtered && <p className="-mt-1 px-4 pb-2 text-xs text-muted-foreground sm:px-6">Showing {cards.length} of {allCards.length} candidates. Drag-and-drop respects the filtered order.</p>}
          <div className="min-h-[560px] flex-1"><KanbanBoard cards={cards} jobId={jobId} /></div>
        </>
      ) : (
        <PipelineTable cards={cards} />
      )}
    </div>
  );
}

function PipelineTable({ cards }: { cards: CardData[] }) {
  const db = useDb();
  const ui = useUI();
  const [sort, setSort] = React.useState<{ key: "name" | "stage" | "applied" | "days"; dir: 1 | -1 }>({ key: "stage", dir: -1 });
  const [selected, setSelected] = React.useState<Set<ID>>(new Set());
  const rows = [...cards].sort((a, b) => {
    const v =
      sort.key === "name" ? fullName(a.candidate).localeCompare(fullName(b.candidate)) :
      sort.key === "stage" ? STAGE_ORDER.indexOf(a.app.stage) - STAGE_ORDER.indexOf(b.app.stage) || a.app.order - b.app.order :
      sort.key === "applied" ? a.app.appliedAt.localeCompare(b.app.appliedAt) :
      daysSince(a.app.stageEnteredAt) - daysSince(b.app.stageEnteredAt);
    return v * sort.dir;
  });
  const th = (key: typeof sort.key, label: string, cls = "") => (
    <th className={cn("h-9 px-3 text-left text-[11px] font-medium uppercase tracking-wider text-subtle-foreground", cls)} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}<ArrowUpDown className={cn("size-3", sort.key === key ? "opacity-100" : "opacity-30")} />
      </button>
    </th>
  );
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.app.id));
  const bulkMove = (stage: StageId) => {
    const apps = rows.filter((r) => selected.has(r.app.id)).map((r) => r.app);
    apps.forEach((a) => api.applications.move(a.id, stage));
    toast.success(`${apps.length} candidate${apps.length > 1 ? "s" : ""} moved to ${db.stages.find((s) => s.id === stage)?.label}`);
    setSelected(new Set());
  };
  return (
    <div className="px-4 pb-6 sm:px-6">
      {selected.size > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand-soft px-3 py-1.5 text-sm animate-fade-in">
          <span className="font-medium text-brand-soft-foreground">{selected.size} selected</span>
          <Select size="sm" className="w-48" placeholder="Move to stage…" value="" onValueChange={(v) => bulkMove(v as StageId)} options={db.stages.map((s) => ({ value: s.id, label: s.label }))} />
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-xs">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-border bg-surface-2/60">
            <tr>
              <th className="w-10 pl-3"><Checkbox aria-label="Select all" checked={allOn ? true : selected.size ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.app.id)) : new Set())} /></th>
              {th("name", "Candidate")}
              {th("stage", "Stage", "w-52")}
              <th className="h-9 px-3 text-left text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Evaluation</th>
              {th("days", "In stage")}
              {th("applied", "Applied")}
              <th className="h-9 px-3 text-left text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Recruiter</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.app.id} className={cn("group transition-colors hover:bg-accent/50", selected.has(r.app.id) && "bg-brand-soft/40")}>
                <td className="pl-3"><Checkbox aria-label={`Select ${fullName(r.candidate)}`} checked={selected.has(r.app.id)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(r.app.id); else n.delete(r.app.id); return n; })} /></td>
                <td className="px-3 py-2">
                  <button onClick={() => ui.openCandidate(r.candidate.id, { applicationId: r.app.id, list: rows.map((x) => x.candidate.id) })} className="flex items-center gap-2.5 text-left">
                    <Avatar name={fullName(r.candidate)} hue={r.candidate.hue} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium group-hover:underline">{fullName(r.candidate)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.candidate.headline}</span>
                    </span>
                    {r.candidate.tags[0] && <Tag className="ml-1 hidden lg:inline-flex">{r.candidate.tags[0]}</Tag>}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <Select size="sm" ariaLabel={`Stage for ${fullName(r.candidate)}`} className="border-transparent bg-transparent shadow-none hover:bg-surface hover:border-border" value={r.app.stage} onValueChange={(v) => moveStage(r.app, v as StageId)} options={db.stages.map((s) => ({ value: s.id, label: s.label }))} />
                </td>
                <td className="px-3 py-2"><EvaluationBadge value={r.app.evaluation} /></td>
                <td className={cn("tabular px-3 py-2 text-xs", r.stage.slaDays > 0 && daysSince(r.app.stageEnteredAt) > r.stage.slaDays ? "text-warning" : "text-muted-foreground")}>{daysSince(r.app.stageEnteredAt)}d</td>
                <td className="tabular px-3 py-2 text-xs text-muted-foreground">{shortDate(r.app.appliedAt)}</td>
                <td className="px-3 py-2">{r.recruiter && <span className="flex items-center gap-1.5 text-xs"><Avatar name={r.recruiter.name} hue={r.recruiter.hue} size="xs" />{r.recruiter.name.split(" ")[0]}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState compact title="No candidates match these filters" />}
      </div>
    </div>
  );
}
