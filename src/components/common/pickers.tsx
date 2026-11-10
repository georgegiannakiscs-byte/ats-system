"use client";
import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { Avatar } from "@/components/ui/avatar";
import { inputBase } from "@/components/ui/input";
import { useDb } from "@/lib/api/store";
import { fullName } from "@/lib/api/selectors";
import { cn } from "@/lib/utils";
import type { ID } from "@/lib/types";

interface Item { id: string; label: string; sub?: string; hue?: number; keywords?: string }

function Combobox({ items, value, onChange, placeholder, id, invalid, multiple, renderAvatar = true, emptyLabel = "No results" }: { items: Item[]; value: ID[]; onChange: (v: ID[]) => void; placeholder: string; id?: string; invalid?: boolean; multiple?: boolean; renderAvatar?: boolean; emptyLabel?: string }) {
  const [open, setOpen] = React.useState(false);
  const selected = value.map((v) => items.find((i) => i.id === v)).filter(Boolean) as Item[];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(inputBase, "flex min-h-8 items-center gap-1.5 py-1 text-left", !selected.length && "text-subtle-foreground")}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 && placeholder}
          {!multiple && selected[0] && (
            <span className="flex min-w-0 items-center gap-1.5 text-foreground">
              {renderAvatar && <Avatar name={selected[0].label} hue={selected[0].hue} size="xs" />}
              <span className="truncate">{selected[0].label}</span>
              {selected[0].sub && <span className="truncate text-xs text-muted-foreground">· {selected[0].sub}</span>}
            </span>
          )}
          {multiple &&
            selected.map((s) => (
              <span key={s.id} className="inline-flex h-6 items-center gap-1 rounded-[5px] bg-muted pl-1 pr-0.5 text-xs text-foreground">
                {renderAvatar && <Avatar name={s.label} hue={s.hue} size="xs" />}
                {s.label}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Remove ${s.label}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((v) => v !== s.id));
                  }}
                  className="flex size-4 items-center justify-center rounded hover:bg-accent"
                >
                  <X className="size-3" />
                </span>
              </span>
            ))}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command>
          <CommandInput placeholder="Search…" className="h-10 text-sm" />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {items.map((i) => {
                const on = value.includes(i.id);
                return (
                  <CommandItem
                    key={i.id}
                    value={`${i.label} ${i.sub ?? ""} ${i.keywords ?? ""} ${i.id}`}
                    onSelect={() => {
                      if (multiple) onChange(on ? value.filter((v) => v !== i.id) : [...value, i.id]);
                      else {
                        onChange([i.id]);
                        setOpen(false);
                      }
                    }}
                  >
                    {renderAvatar && <Avatar name={i.label} hue={i.hue} size="xs" />}
                    <span className="truncate">{i.label}</span>
                    {i.sub && <span className="truncate text-xs text-muted-foreground">{i.sub}</span>}
                    {on && <Check className="ml-auto !text-foreground" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TeamPicker({ value, onChange, multiple, placeholder = "Select teammate", id, invalid, filter }: { value: ID[]; onChange: (v: ID[]) => void; multiple?: boolean; placeholder?: string; id?: string; invalid?: boolean; filter?: (role: string) => boolean }) {
  const db = useDb();
  const items = db.team.filter((m) => !filter || filter(m.role)).map((m) => ({ id: m.id, label: m.name, sub: m.title, hue: m.hue, keywords: m.role }));
  return <Combobox items={items} value={value} onChange={onChange} multiple={multiple} placeholder={placeholder} id={id} invalid={invalid} />;
}

export function CandidatePicker({ value, onChange, id, invalid, onlyActive }: { value?: ID; onChange: (v?: ID) => void; id?: string; invalid?: boolean; onlyActive?: boolean }) {
  const db = useDb();
  const activeIds = new Set(db.applications.filter((a) => a.status === "active").map((a) => a.candidateId));
  const items = db.candidates.filter((c) => !onlyActive || activeIds.has(c.id)).map((c) => ({ id: c.id, label: fullName(c), sub: c.headline, hue: c.hue, keywords: c.email }));
  return <Combobox items={items} value={value ? [value] : []} onChange={(v) => onChange(v[0])} placeholder="Search candidates" id={id} invalid={invalid} />;
}

export function JobPicker({ value, onChange, id, invalid, placeholder = "Select a job", openOnly }: { value?: ID; onChange: (v?: ID) => void; id?: string; invalid?: boolean; placeholder?: string; openOnly?: boolean }) {
  const db = useDb();
  const items = db.jobs.filter((j) => !openOnly || j.status === "published" || j.status === "on_hold" || j.status === "draft").map((j) => ({ id: j.id, label: j.title, sub: `${j.department} · ${j.location}` }));
  return <Combobox items={items} value={value ? [value] : []} onChange={(v) => onChange(v[0])} placeholder={placeholder} id={id} invalid={invalid} renderAvatar={false} />;
}
