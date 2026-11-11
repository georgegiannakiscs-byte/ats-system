"use client";
import * as React from "react";
import { toast } from "sonner";
import { BriefcaseBusiness, Ellipsis, Layers, Library, MapPin, Plus, Sparkles, Trash2, UserMinus, UserPlus, Tag as TagIcon, X } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { usePageMeta } from "@/components/shell/page-meta";
import { useUI } from "@/components/shell/ui-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Avatar } from "@/components/ui/avatar";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { SearchInput } from "@/components/common/search-input";
import { FilterMenu } from "@/components/common/filter-menu";
import { Tag } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { fullName, primaryApplication } from "@/lib/api/selectors";
import type { ID } from "@/lib/types";
import { cn, plural, shortDate } from "@/lib/utils";

export default function TalentPoolPage() {
  const db = useDb();
  const ui = useUI();
  usePageMeta("Talent Pool");
  const [listId, setListId] = React.useState<ID | "all">("all");
  const [q, setQ] = React.useState("");
  const [skills, setSkills] = React.useState<string[]>([]);
  const [tags, setTags] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<Set<ID>>(new Set());
  const [newList, setNewList] = React.useState(false);
  const [deleteList, setDeleteList] = React.useState<ID | null>(null);

  const pool = db.candidates.filter((c) => c.inTalentPool);
  const list = listId === "all" ? undefined : db.talentLists.find((l) => l.id === listId);
  const base = list ? db.candidates.filter((c) => list.candidateIds.includes(c.id)) : pool;
  const query = q.toLowerCase().trim();
  const people = base.filter(
    (c) =>
      (!query || `${fullName(c)} ${c.headline} ${c.currentCompany} ${c.location} ${c.skills.join(" ")} ${c.tags.join(" ")}`.toLowerCase().includes(query)) &&
      (!skills.length || skills.some((s) => c.skills.includes(s))) &&
      (!tags.length || tags.some((t) => c.tags.includes(t))),
  );
  const allSkills = Array.from(new Set(base.flatMap((c) => c.skills))).sort();
  const allTags = Array.from(new Set(base.flatMap((c) => c.tags))).sort();
  const ids = people.map((p) => p.id);
  const sel = Array.from(selected).filter((id) => ids.includes(id));

  React.useEffect(() => setSelected(new Set()), [listId]);

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 p-4 sm:p-6 lg:grid-cols-[232px_1fr]">
      <aside className="space-y-1 lg:sticky lg:top-16 lg:self-start">
        <button onClick={() => setListId("all")} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-sm transition-colors", listId === "all" ? "bg-surface font-medium shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
          <Library className="size-4" /><span className="flex-1 text-left">All talent</span><span className="tabular text-xs text-subtle-foreground">{pool.length}</span>
        </button>
        <div className="flex items-center justify-between px-2.5 pb-1 pt-4">
          <span className="text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Saved lists</span>
          <Button variant="ghost" size="icon-xs" aria-label="New list" onClick={() => setNewList(true)}><Plus /></Button>
        </div>
        {db.talentLists.map((l) => (
          <div key={l.id} className="group relative">
            <button onClick={() => setListId(l.id)} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2.5 pr-8 text-sm transition-colors", listId === l.id ? "bg-surface font-medium shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <Layers className="size-4 shrink-0" /><span className="flex-1 truncate text-left">{l.name}</span><span className="tabular text-xs text-subtle-foreground group-hover:opacity-0">{l.candidateIds.length}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label={`Options for ${l.name}`}><Ellipsis /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start"><DropdownMenuItem destructive onSelect={() => setDeleteList(l.id)}><Trash2 />Delete list</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        <p className="px-2.5 pt-4 text-xs leading-relaxed text-muted-foreground">Silver medalists and sourced profiles live here, ready for the next opening.</p>
      </aside>

      <section className="min-w-0">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{list?.name ?? "All talent"}</h2>
            <p className="text-sm text-muted-foreground">{list?.description ?? "Everyone you've saved for future opportunities."}</p>
          </div>
          <Button size="sm" onClick={() => ui.addCandidate()}><UserPlus />Add to pool</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 py-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search skills, titles, companies…" className="sm:w-72" />
          <FilterMenu label="Skills" icon={<Sparkles />} searchable options={allSkills.map((s) => ({ value: s, label: s, count: base.filter((c) => c.skills.includes(s)).length }))} selected={skills} onChange={setSkills} />
          <FilterMenu label="Tags" icon={<TagIcon />} options={allTags.map((s) => ({ value: s, label: s }))} selected={tags} onChange={setTags} />
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={sel.length > 0 && sel.length === ids.length ? true : sel.length ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v ? new Set(ids) : new Set())} aria-label="Select all" />
            Select all
          </label>
        </div>

        {sel.length > 0 && (
          <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-popover px-2 py-1.5 shadow-md animate-fade-in">
            <span className="px-1.5 text-sm font-medium">{sel.length} selected</span>
            <Button variant="ghost" size="icon-xs" aria-label="Clear selection" onClick={() => setSelected(new Set())}><X /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={() => ui.addToJob(sel)}><BriefcaseBusiness />Add to job</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Layers />Add to list</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Lists</DropdownMenuLabel>
                {db.talentLists.map((l) => <DropdownMenuItem key={l.id} onSelect={() => (api.talentLists.addCandidates(l.id, sel), toast.success(`Added to “${l.name}”`))}>{l.name}</DropdownMenuItem>)}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setNewList(true)}><Plus />New list with selection</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {list ? (
              <Button variant="ghost" size="sm" onClick={() => { sel.forEach((id) => api.talentLists.removeCandidate(list.id, id)); setSelected(new Set()); toast(`Removed from “${list.name}”`); }}><UserMinus />Remove from list</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => { api.candidates.setTalentPool(sel, false); setSelected(new Set()); toast(`${plural(sel.length, "person", "people")} removed from talent pool`, { action: { label: "Undo", onClick: () => api.candidates.setTalentPool(sel, true) } }); }}><UserMinus />Remove from pool</Button>
            )}
          </div>
        )}

        {people.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface shadow-xs">
            <EmptyState icon={<Library />} title={base.length ? "No one matches" : "This list is empty"} description={base.length ? "Try a broader search." : "Select people in All talent and add them to this list."} action={base.length ? undefined : <Button size="sm" variant="outline" onClick={() => setListId("all")}>Browse all talent</Button>} />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {people.map((c) => {
              const on = selected.has(c.id);
              const app = primaryApplication(db, c.id);
              const lastJob = app ? db.jobs.find((j) => j.id === app.jobId) : undefined;
              return (
                <li key={c.id} className={cn("group relative flex flex-col rounded-xl border bg-surface p-4 shadow-xs transition-all hover:border-border-strong hover:shadow-sm", on ? "border-brand/40 ring-1 ring-brand/20" : "border-border")}>
                  <div className="flex items-start gap-3">
                    <Checkbox checked={on} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(c.id); else n.delete(c.id); return n; })} aria-label={`Select ${fullName(c)}`} className={cn("absolute left-3 top-3 transition-opacity", on ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")} />
                    <Avatar name={fullName(c)} hue={c.hue} size="lg" className={cn("transition-opacity", on && "opacity-0")} />
                    <button onClick={() => ui.openCandidate(c.id, { list: ids })} className="min-w-0 flex-1 text-left">
                      <p className="truncate font-medium group-hover:underline">{fullName(c)}</p>
                      <p className="truncate text-sm text-foreground/80">{c.headline}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="size-3" />{c.location} · {c.currentCompany}</p>
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {c.skills.slice(0, 4).map((s) => <Tag key={s}>{s}</Tag>)}
                    {c.tags.includes("Silver medalist") && <Tag className="bg-brand-soft text-brand-soft-foreground">Silver medalist</Tag>}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
                    <span className="truncate">{lastJob ? `Last considered for ${lastJob.title}` : `Sourced ${shortDate(c.createdAt)} · ${c.source}`}</span>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => ui.addToJob([c.id])}><BriefcaseBusiness />Add to job</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <NewListDialog open={newList} onOpenChange={setNewList} onCreate={async (name, desc) => { const l = await api.talentLists.create(name, desc, sel); setListId(l.id); toast.success(`List “${name}” created`, { description: sel.length ? `${plural(sel.length, "person", "people")} added` : undefined }); }} />
      <ConfirmDialog open={!!deleteList} onOpenChange={(o) => !o && setDeleteList(null)} title="Delete this list?" description="People stay in the talent pool - only the list is removed." confirmLabel="Delete list" destructive onConfirm={() => { api.talentLists.remove(deleteList!); if (listId === deleteList) setListId("all"); toast("List deleted"); }} />
    </div>
  );
}

function NewListDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (name: string, desc?: string) => void }) {
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [err, setErr] = React.useState<string>();
  React.useEffect(() => { if (open) { setName(""); setDesc(""); setErr(undefined); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (name.trim().length < 2) return setErr("Name the list"); onCreate(name.trim(), desc.trim() || undefined); onOpenChange(false); }}>
          <DialogHeader icon={<Layers />} title="New list" description="Group people for a future role or campaign." />
          <DialogBody className="space-y-4">
            <Field label="Name" required error={err}><Input autoFocus value={name} onChange={(e) => (setName(e.target.value), setErr(undefined))} placeholder="e.g. Data - 2027 pipeline" aria-invalid={!!err || undefined} /></Field>
            <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-16" /></Field>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">Create list</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
