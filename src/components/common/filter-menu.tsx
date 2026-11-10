"use client";
import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

export interface FilterOption { value: string; label: string; icon?: React.ReactNode; count?: number }

/** Compact multi-select filter: a chip that opens a searchable checklist. */
export function FilterMenu({ label, options, selected, onChange, icon, searchable }: { label: string; options: FilterOption[]; selected: string[]; onChange: (v: string[]) => void; icon?: React.ReactNode; searchable?: boolean }) {
  const [q, setQ] = React.useState("");
  const active = selected.length > 0;
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const summary = active ? (selected.length === 1 ? options.find((o) => o.value === selected[0])?.label : `${selected.length} selected`) : null;
  return (
    <Popover onOpenChange={(o) => !o && setQ("")}>
      <div className={cn("inline-flex h-8 items-center rounded-md border text-xs font-medium shadow-xs transition-colors", active ? "border-brand/30 bg-brand-soft text-brand-soft-foreground" : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground")}>
        <PopoverTrigger className="inline-flex h-full items-center gap-1.5 rounded-md pl-2.5 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5">
          {icon}
          <span>{label}</span>
          {summary && <span className="max-w-32 truncate font-semibold">: {summary}</span>}
          {!active && <ChevronDown className="opacity-60" />}
        </PopoverTrigger>
        {active && (
          <button aria-label={`Clear ${label} filter`} onClick={() => onChange([])} className="mr-1 flex size-5 items-center justify-center rounded hover:bg-brand/10">
            <X className="size-3" />
          </button>
        )}
      </div>
      <PopoverContent className="w-60 p-0">
        {searchable && (
          <div className="border-b border-border p-1.5">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${label.toLowerCase()}…`} className="h-7 w-full rounded bg-transparent px-1.5 text-sm outline-none placeholder:text-subtle-foreground" />
          </div>
        )}
        <div role="listbox" aria-multiselectable className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
          {shown.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</p>}
          {shown.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button key={o.value} role="option" aria-selected={on} onClick={() => toggle(o.value)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent">
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors", on ? "border-brand bg-brand text-brand-foreground" : "border-border-strong")}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                {o.icon}
                <span className="flex-1 truncate">{o.label}</span>
                {o.count !== undefined && <span className="tabular text-xs text-subtle-foreground">{o.count}</span>}
              </button>
            );
          })}
        </div>
        {active && (
          <div className="border-t border-border p-1">
            <button onClick={() => onChange([])} className="h-7 w-full rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground">Clear selection</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
