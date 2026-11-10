"use client";
import * as React from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputBase } from "@/components/ui/input";
import { Tag } from "@/components/common/badges";

/** Click-to-edit text. Enter saves, Escape cancels. */
export function InlineEdit({ value, onSave, label, placeholder = "Add…", validate, className, type = "text", display }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; validate?: (v: string) => string | undefined; className?: string; type?: string; display?: React.ReactNode }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [error, setError] = React.useState<string>();
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setDraft(value), [value]);
  React.useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const commit = () => {
    const err = validate?.(draft.trim());
    if (err) return setError(err);
    if (draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
    setError(undefined);
  };
  if (editing)
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <div className="flex items-center gap-1">
          <input
            ref={ref}
            type={type}
            aria-label={label}
            aria-invalid={!!error || undefined}
            value={draft}
            onChange={(e) => (setDraft(e.target.value), setError(undefined))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setDraft(value);
                setEditing(false);
                setError(undefined);
              }
            }}
            className={cn(inputBase, "h-7 text-sm")}
          />
          <button type="button" onClick={commit} aria-label="Save" className="flex size-7 shrink-0 items-center justify-center rounded-md text-success hover:bg-accent"><Check className="size-3.5" /></button>
          <button type="button" onClick={() => (setDraft(value), setEditing(false), setError(undefined))} aria-label="Cancel" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><X className="size-3.5" /></button>
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    );
  return (
    <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${label}`} className={cn("group -mx-1.5 flex min-h-7 w-[calc(100%+0.75rem)] items-center gap-1.5 rounded-md px-1.5 text-left text-sm transition-colors hover:bg-accent", className)}>
      <span className={cn("min-w-0 flex-1 truncate", !value && "text-subtle-foreground")}>{display ?? (value || placeholder)}</span>
      <Pencil className="size-3 shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}

export function TagEditor({ tags, onChange, suggestions = [] }: { tags: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const add = (t: string) => {
    const v = t.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft("");
  };
  const listId = React.useId();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span key={t} className="group inline-flex items-center">
          <Tag className="pr-0.5">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="ml-0.5 flex size-3.5 items-center justify-center rounded opacity-50 hover:bg-background hover:opacity-100">
              <X className="size-2.5" />
            </button>
          </Tag>
        </span>
      ))}
      {adding ? (
        <>
          <input
            autoFocus
            list={listId}
            value={draft}
            aria-label="New tag"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => (add(draft), setAdding(false))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setDraft("");
                setAdding(false);
              }
            }}
            className="h-[18px] w-28 rounded-[4px] border border-input bg-surface px-1 text-[11px] outline-none focus:border-brand/60"
            placeholder="Tag name"
          />
          <datalist id={listId}>{suggestions.filter((s) => !tags.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
        </>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex h-[18px] items-center gap-0.5 rounded-[4px] border border-dashed border-border-strong px-1.5 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground">
          <Plus className="size-2.5" /> Tag
        </button>
      )}
    </div>
  );
}
