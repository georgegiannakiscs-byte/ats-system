"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, BookmarkPlus, BriefcaseBusiness, ChevronLeft, ChevronRight, CircleCheck, Columns3, Download, Globe, Library, Tag as TagIcon, UserPlus, Users, UserX, Workflow, X, Layers, Check,
} from "lucide-react";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { usePageMeta } from "@/components/shell/page-meta";
import { useUI } from "@/components/shell/ui-context";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Avatar } from "@/components/ui/avatar";
import { Input, Field } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/overlays";
import { SearchInput } from "@/components/common/search-input";
import { FilterMenu } from "@/components/common/filter-menu";
import { EvaluationBadge, StageBadge, Tag } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { CANDIDATE_COLUMNS, EVALUATION, SOURCES, STAGE_ORDER, STAGE_TONE } from "@/lib/constants";
import { emptyFilters } from "@/lib/mock/seed";
import { fullName } from "@/lib/api/selectors";
import type { Application, Candidate, CandidateColumn, CandidateFilters, Evaluation, ID, Job, SavedView, StageId, TeamMember } from "@/lib/types";
import { cn, plural, shortDate } from "@/lib/utils";

const PAGE_SIZE = 25;
type Row = { app: Application; candidate: Candidate; job?: Job; recruiter?: TeamMember };

export default function CandidatesPage() {
  return (
    <React.Suspense>
      <CandidatesDirectory />
    </React.Suspense>
  );
}

function CandidatesDirectory() {
  const db = useDb();
  const ui = useUI();
  const sp = useSearchParams();
  usePageMeta("Candidates");

  const initialFilters = React.useMemo<CandidateFilters>(() => {
    const f = emptyFilters();
    const stage = sp.get("stage");
    const source = sp.get("source");
    const job = sp.get("job");
    if (stage && (STAGE_ORDER as string[]).includes(stage)) f.stages = [stage as StageId];
    if (source) f.sources = [source as CandidateFilters["sources"][number]];
    if (job) f.jobIds = [job];
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hasUrlFilters = initialFilters.stages.length + initialFilters.sources.length + initialFilters.jobIds.length > 0;

  const [viewId, setViewId] = React.useState<ID | null>(hasUrlFilters ? null : "v_all");
  const baseView = db.savedViews.find((v) => v.id === viewId);
  const [filters, setFilters] = React.useState<CandidateFilters>(baseView?.filters ?? initialFilters);
  const [columns, setColumns] = React.useState<CandidateColumn[]>(baseView?.columns ?? db.savedViews[0].columns);
  const [sort, setSort] = React.useState<SavedView["sort"]>(baseView?.sort ?? { key: "applied", dir: "desc" });
  const [selected, setSelected] = React.useState<Set<ID>>(new Set());
  const [page, setPage] = React.useState(0);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [deleteView, setDeleteView] = React.useState<SavedView | null>(null);
  const [bulkReject, setBulkReject] = React.useState(false);
  const [tagOpen, setTagOpen] = React.useState(false);

  const applyView = (v: SavedView) => {
    setViewId(v.id);
    setFilters(v.filters);
    setColumns(v.columns);
    setSort(v.sort);
    setSelected(new Set());
    setPage(0);
  };
  const patch = (p: Partial<CandidateFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(0);
  };
  const dirty = !baseView || JSON.stringify([baseView.filters, baseView.columns, baseView.sort]) !== JSON.stringify([filters, columns, sort]);

  const rows = React.useMemo<Row[]>(() => {
    const jobs = new Map(db.jobs.map((j) => [j.id, j]));
    const team = new Map(db.team.map((m) => [m.id, m]));
    const cands = new Map(db.candidates.map((c) => [c.id, c]));
    const q = filters.search.toLowerCase().trim();
    const list = db.applications
      .filter((a) => filters.status === "all" || a.status === filters.status)
      .map((app) => ({ app, candidate: cands.get(app.candidateId)!, job: jobs.get(app.jobId), recruiter: team.get(app.recruiterId) }))
      .filter((r) => r.candidate)
      .filter(({ app, candidate, job }) =>
        (!filters.stages.length || filters.stages.includes(app.stage)) &&
        (!filters.jobIds.length || filters.jobIds.includes(app.jobId)) &&
        (!filters.sources.length || filters.sources.includes(candidate.source)) &&
        (!filters.recruiterIds.length || filters.recruiterIds.includes(app.recruiterId)) &&
        (!filters.evaluations.length || filters.evaluations.includes(app.evaluation)) &&
        (!q || `${fullName(candidate)} ${candidate.email} ${candidate.headline} ${candidate.currentCompany} ${candidate.location} ${job?.title} ${candidate.tags.join(" ")} ${candidate.skills.join(" ")}`.toLowerCase().includes(q)),
      );
    const dir = sort.dir === "asc" ? 1 : -1;
    const key = sort.key;
    const val = (r: Row): string | number =>
      key === "name" ? fullName(r.candidate) : key === "position" ? r.candidate.headline : key === "job" ? r.job?.title ?? "" : key === "source" ? r.candidate.source : key === "stage" ? STAGE_ORDER.indexOf(r.app.stage) : key === "recruiter" ? r.recruiter?.name ?? "" : key === "evaluation" ? ["positive", "mixed", "pending", "none", "negative"].indexOf(r.app.evaluation) : key === "location" ? r.candidate.location : r.app.appliedAt;
    return list.sort((a, b) => {
      const va = val(a), vb = val(b);
      return (typeof va === "number" ? va - (vb as number) : va.localeCompare(vb as string)) * dir;
    });
  }, [db, filters, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const selectedRows = rows.filter((r) => selected.has(r.app.id));
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.app.id));
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : key === "applied" ? "desc" : "asc" }));
  const activeFilterCount = filters.stages.length + filters.jobIds.length + filters.sources.length + filters.recruiterIds.length + filters.evaluations.length + (filters.search ? 1 : 0);

  const exportCsv = () => {
    const target = selectedRows.length ? selectedRows : rows;
    const header = ["Name", "Email", "Current position", "Job", "Stage", "Status", "Source", "Applied", "Recruiter", "Evaluation"];
    const esc = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const lines = target.map((r) => [fullName(r.candidate), r.candidate.email, r.candidate.headline, r.job?.title ?? "", db.stages.find((s) => s.id === r.app.stage)?.label ?? "", r.app.status, r.candidate.source, r.app.appliedAt.slice(0, 10), r.recruiter?.name ?? "", EVALUATION[r.app.evaluation].label].map(esc).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `candidates-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${plural(target.length, "candidate")}`);
  };

  const col = (c: CandidateColumn) => columns.includes(c);

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      {/* Saved views */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border scrollbar-none">
        {db.savedViews.map((v) => (
          <div key={v.id} className="group relative flex shrink-0 items-center">
            <button onClick={() => applyView(v)} className={cn("-mb-px flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-sm font-medium transition-colors", viewId === v.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {!v.system && <Layers className="size-3.5 text-subtle-foreground" />}
              {v.name}
            </button>
            {!v.system && (
              <button onClick={() => setDeleteView(v)} aria-label={`Delete view ${v.name}`} className="mr-1 flex size-5 items-center justify-center rounded text-subtle-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100">
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
        {viewId === null && <span className="-mb-px flex h-9 shrink-0 items-center border-b-2 border-foreground px-2.5 text-sm font-medium italic">Unsaved view</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1 pb-1">
          {dirty && (
            <>
              {baseView && !baseView.system && (
                <Button variant="ghost" size="sm" onClick={() => (api.views.update(baseView.id, { filters, columns, sort }), toast.success(`View “${baseView.name}” updated`))}>Update view</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSaveOpen(true)}><BookmarkPlus />Save view</Button>
            </>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 py-3">
        <SearchInput value={filters.search} onChange={(v) => patch({ search: v })} placeholder="Search name, skill, company…" className="sm:w-64" />
        <FilterMenu label="Stage" icon={<Workflow />} options={db.stages.map((s) => ({ value: s.id, label: s.label, icon: <span className="size-2 rounded-full" style={{ background: STAGE_TONE[s.id] }} /> }))} selected={filters.stages} onChange={(v) => patch({ stages: v as StageId[] })} />
        <FilterMenu label="Job" icon={<BriefcaseBusiness />} searchable options={db.jobs.map((j) => ({ value: j.id, label: j.title }))} selected={filters.jobIds} onChange={(v) => patch({ jobIds: v })} />
        <FilterMenu label="Source" icon={<Globe />} options={SOURCES.map((s) => ({ value: s, label: s }))} selected={filters.sources} onChange={(v) => patch({ sources: v as CandidateFilters["sources"] })} />
        <FilterMenu label="Recruiter" icon={<Users />} options={db.team.filter((m) => m.role === "Recruiter" || m.role === "Admin").map((m) => ({ value: m.id, label: m.name }))} selected={filters.recruiterIds} onChange={(v) => patch({ recruiterIds: v })} />
        <FilterMenu label="Evaluation" icon={<CircleCheck />} options={(Object.keys(EVALUATION) as Evaluation[]).map((e) => ({ value: e, label: EVALUATION[e].label }))} selected={filters.evaluations} onChange={(v) => patch({ evaluations: v as Evaluation[] })} />
        {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={() => patch({ ...emptyFilters(), status: filters.status })}>Clear all</Button>}
        <div className="ml-auto flex items-center gap-2">
          <Segmented ariaLabel="Status" value={filters.status} onChange={(v) => patch({ status: v })} options={[{ value: "active", label: "Active" }, { value: "hired", label: "Hired" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All" }]} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="Choose columns" title="Columns"><Columns3 /></Button></DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {CANDIDATE_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={col(c.id)} onCheckedChange={(on) => setColumns((cs) => (on ? CANDIDATE_COLUMNS.map((x) => x.id).filter((x) => cs.includes(x) || x === c.id) : cs.filter((x) => x !== c.id)))}>
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="icon-sm" aria-label="Export CSV" title="Export CSV" onClick={exportCsv}><Download /></Button>
          <Button size="sm" onClick={() => ui.addCandidate()}><UserPlus />Add</Button>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="sticky top-14 z-20 mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-popover px-2 py-1.5 shadow-md animate-fade-in">
          <span className="px-1.5 text-sm font-medium">{selected.size} selected</span>
          <Button variant="ghost" size="icon-xs" aria-label="Clear selection" onClick={() => setSelected(new Set())}><X /></Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Workflow />Move stage</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {db.stages.map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => { selectedRows.forEach((r) => api.applications.move(r.app.id, s.id)); toast.success(`${plural(selectedRows.length, "candidate")} moved to ${s.label}`); setSelected(new Set()); }}>
                  <span className="size-2 rounded-full" style={{ background: STAGE_TONE[s.id] }} />{s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => setTagOpen(true)}><TagIcon />Add tag</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Library />Talent pool</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={() => { api.candidates.setTalentPool(selectedRows.map((r) => r.candidate.id), true); toast.success("Saved to talent pool"); }}><Library />Save to talent pool</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><Layers />Add to list</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {db.talentLists.map((l) => (
                    <DropdownMenuItem key={l.id} onSelect={() => { api.talentLists.addCandidates(l.id, selectedRows.map((r) => r.candidate.id)); toast.success(`Added to “${l.name}”`); }}>{l.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => ui.addToJob(Array.from(new Set(selectedRows.map((r) => r.candidate.id))))}><BriefcaseBusiness />Add to job</Button>
          <Button variant="ghost" size="sm" onClick={exportCsv}><Download />Export</Button>
          <Button variant="destructive-ghost" size="sm" disabled={!selectedRows.some((r) => r.app.status === "active")} onClick={() => setBulkReject(true)}><UserX />Reject</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-xs">
          <EmptyState icon={<Users />} title="No candidates match" description="Try removing a filter or searching for something else." action={<Button variant="outline" size="sm" onClick={() => patch({ ...emptyFilters() })}>Reset filters</Button>} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <div className="max-h-[calc(100dvh-270px)] min-h-80 overflow-auto scrollbar-thin">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-border">
                  <th className="sticky top-0 z-10 w-10 bg-surface-2 pl-4"><Checkbox aria-label="Select all on page" checked={allOnPage ? true : pageRows.some((r) => selected.has(r.app.id)) ? "indeterminate" : false} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); pageRows.forEach((r) => (v ? n.add(r.app.id) : n.delete(r.app.id))); return n; })} /></th>
                  <SortTh sort={sort} onSort={toggleSort} id="name" label="Candidate" />
                  {col("position") && <SortTh sort={sort} onSort={toggleSort} id="position" label="Current position" />}
                  {col("job") && <SortTh sort={sort} onSort={toggleSort} id="job" label="Applied job" />}
                  {col("source") && <SortTh sort={sort} onSort={toggleSort} id="source" label="Source" />}
                  {col("stage") && <SortTh sort={sort} onSort={toggleSort} id="stage" label="Stage" />}
                  {col("applied") && <SortTh sort={sort} onSort={toggleSort} id="applied" label="Applied" />}
                  {col("recruiter") && <SortTh sort={sort} onSort={toggleSort} id="recruiter" label="Recruiter" />}
                  {col("evaluation") && <SortTh sort={sort} onSort={toggleSort} id="evaluation" label="Evaluation" />}
                  {col("location") && <SortTh sort={sort} onSort={toggleSort} id="location" label="Location" />}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const on = selected.has(r.app.id);
                  return (
                    <tr key={r.app.id} className={cn("group border-b border-border/70 transition-colors last:border-0 hover:bg-accent/50", on && "bg-brand-soft/40 hover:bg-brand-soft/60")}>
                      <td className="pl-4"><Checkbox aria-label={`Select ${fullName(r.candidate)}`} checked={on} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(r.app.id); else n.delete(r.app.id); return n; })} /></td>
                      <td className="px-3 py-2">
                        <button onClick={() => ui.openCandidate(r.candidate.id, { applicationId: r.app.id, list: rows.map((x) => x.candidate.id) })} className="flex max-w-64 items-center gap-2.5 text-left outline-none">
                          <Avatar name={fullName(r.candidate)} hue={r.candidate.hue} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium group-hover:underline">{fullName(r.candidate)}</span>
                            <span className="block truncate text-xs text-muted-foreground">{r.candidate.email}</span>
                          </span>
                        </button>
                      </td>
                      {col("position") && <td className="max-w-56 px-3 py-2"><span className="block truncate">{r.candidate.headline}</span><span className="block truncate text-xs text-muted-foreground">{r.candidate.currentCompany}</span></td>}
                      {col("job") && <td className="max-w-52 truncate px-3 py-2 text-foreground/85">{r.job?.title}</td>}
                      {col("source") && <td className="px-3 py-2 text-xs text-muted-foreground">{r.candidate.source}</td>}
                      {col("stage") && <td className="px-3 py-2"><StageBadge stage={r.app.stage} status={r.app.status} /></td>}
                      {col("applied") && <td className="tabular whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{shortDate(r.app.appliedAt)}</td>}
                      {col("recruiter") && <td className="px-3 py-2">{r.recruiter && <span className="flex items-center gap-1.5 whitespace-nowrap text-xs"><Avatar name={r.recruiter.name} hue={r.recruiter.hue} size="xs" />{r.recruiter.name}</span>}</td>}
                      {col("evaluation") && <td className="whitespace-nowrap px-3 py-2"><EvaluationBadge value={r.app.evaluation} /></td>}
                      {col("location") && <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{r.candidate.location}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span className="tabular">{rows.length === 0 ? "0" : `${page * PAGE_SIZE + 1}–${Math.min(rows.length, (page + 1) * PAGE_SIZE)}`} of {rows.length}</span>
            <div className="flex items-center gap-1">
              <span className="tabular mr-2">Page {page + 1} of {pageCount}</span>
              <Button variant="outline" size="icon-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft /></Button>
              <Button variant="outline" size="icon-xs" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight /></Button>
            </div>
          </div>
        </div>
      )}

      <SaveViewDialog open={saveOpen} onOpenChange={setSaveOpen} onSave={async (name) => { const v = await api.views.save({ name, filters, columns, sort }); setViewId(v.id); toast.success(`View “${name}” saved`); }} />
      <TagDialog open={tagOpen} onOpenChange={setTagOpen} onSave={(tag) => { api.candidates.addTags(selectedRows.map((r) => r.candidate.id), [tag]); toast.success(`Tagged ${plural(selectedRows.length, "candidate")} “${tag}”`); }} />
      <ConfirmDialog open={!!deleteView} onOpenChange={(o) => !o && setDeleteView(null)} title={`Delete view “${deleteView?.name}”?`} description="Candidates aren't affected — only this saved filter is removed." confirmLabel="Delete view" destructive onConfirm={() => { api.views.remove(deleteView!.id); if (viewId === deleteView!.id) applyView(db.savedViews[0]); toast("View deleted"); }} />
      <ConfirmDialog
        open={bulkReject}
        onOpenChange={setBulkReject}
        title={`Reject ${plural(selectedRows.filter((r) => r.app.status === "active").length, "candidate")}?`}
        description="They'll be moved out of the active pipeline with the reason “Other” and kept in the talent pool. No emails are sent."
        confirmLabel="Reject"
        destructive
        onConfirm={() => {
          const target = selectedRows.filter((r) => r.app.status === "active");
          target.forEach((r) => api.applications.reject(r.app.id, "Other", true));
          toast(`${plural(target.length, "candidate")} rejected`, { action: { label: "Undo", onClick: () => target.forEach((r) => api.applications.restore(r.app.id)) } });
          setSelected(new Set());
        }}
      />
    </div>
  );
}

function SaveViewDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (name: string) => void }) {
  const [name, setName] = React.useState("");
  const [err, setErr] = React.useState<string>();
  React.useEffect(() => { if (open) { setName(""); setErr(undefined); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length < 2) return setErr("Give the view a name"); onSave(name.trim()); onOpenChange(false); }} noValidate>
          <DialogHeader icon={<BookmarkPlus />} title="Save view" description="Saves the current filters, sort and columns." />
          <DialogBody><Field label="Name" error={err}><Input autoFocus value={name} onChange={(e) => (setName(e.target.value), setErr(undefined))} placeholder="e.g. Design — final stages" aria-invalid={!!err || undefined} /></Field></DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit"><Check />Save view</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TagDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (tag: string) => void }) {
  const db = useDb();
  const [tag, setTag] = React.useState("");
  React.useEffect(() => { if (open) setTag(""); }, [open]);
  const suggestions = Array.from(new Set(db.candidates.flatMap((c) => c.tags))).slice(0, 10);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={(e) => { e.preventDefault(); if (!tag.trim()) return; onSave(tag.trim()); onOpenChange(false); }}>
          <DialogHeader icon={<TagIcon />} title="Add tag" />
          <DialogBody className="space-y-3">
            <Input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag name" aria-label="Tag name" />
            <div className="flex flex-wrap gap-1">{suggestions.map((s) => <button type="button" key={s} onClick={() => setTag(s)}><Tag className="hover:bg-accent hover:text-foreground">{s}</Tag></button>)}</div>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!tag.trim()}>Add tag</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function SortTh({ id, label, className, sort, onSort }: { id: string; label: string; className?: string; sort: SavedView["sort"]; onSort: (key: string) => void }) {
  return (
    <th className={cn("sticky top-0 z-10 h-9 whitespace-nowrap bg-surface-2 px-3 text-left text-[11px] font-medium uppercase tracking-wider text-subtle-foreground", className)} aria-sort={sort.key === id ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => onSort(id)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground">
        {label}
        {sort.key === id && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}
