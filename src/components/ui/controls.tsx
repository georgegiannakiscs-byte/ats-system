"use client";
import * as React from "react";
import { Checkbox as CB, Switch as SW, Select as S, Tabs as TB } from "radix-ui";
import { Check, ChevronDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────────── Checkbox ───────────── */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CB.Root>) {
  return (
    <CB.Root
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-strong bg-surface shadow-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-foreground data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand data-[state=indeterminate]:text-brand-foreground",
        className,
      )}
      {...props}
    >
      <CB.Indicator className="flex items-center justify-center data-[state=checked]:animate-in data-[state=checked]:zoom-in-75 duration-100">
        {props.checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </CB.Indicator>
    </CB.Root>
  );
}

/* ───────────── Switch ───────────── */
export function Switch({ className, ...props }: React.ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        "inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent bg-border-strong p-px shadow-inner outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring data-[state=checked]:bg-brand disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SW.Thumb className="block size-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[14px]" />
    </SW.Root>
  );
}

/* ───────────── Select ───────────── */
export function Select({
  value, onValueChange, options, placeholder, className, id, size = "default", ariaLabel, invalid,
}: {
  value?: string; onValueChange: (v: string) => void; options: { value: string; label: React.ReactNode; hint?: string }[]; placeholder?: string; className?: string; id?: string; size?: "default" | "sm"; ariaLabel?: string; invalid?: boolean;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-2.5 text-left text-sm shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[placeholder]:text-subtle-foreground aria-invalid:border-destructive [&>span]:truncate",
          size === "sm" ? "h-7 text-xs" : "h-8",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon><ChevronDown className="size-3.5 text-muted-foreground" /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} className="z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 duration-100">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="relative flex h-8 cursor-default select-none items-center rounded-md pl-2 pr-8 text-sm outline-none data-[highlighted]:bg-accent">
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span>}
                <S.ItemIndicator className="absolute right-2"><Check className="size-3.5" /></S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

/* ───────────── Tabs (underline) ───────────── */
export const Tabs = TB.Root;
export const TabsContent = ({ className, ...props }: React.ComponentProps<typeof TB.Content>) => (
  <TB.Content className={cn("outline-none data-[state=active]:animate-fade-in", className)} {...props} />
);
export function TabsList({ className, ...props }: React.ComponentProps<typeof TB.List>) {
  return <TB.List className={cn("flex items-center gap-1 overflow-x-auto border-b border-border scrollbar-none", className)} {...props} />;
}
export function TabsTrigger({ className, count, children, ...props }: React.ComponentProps<typeof TB.Trigger> & { count?: number }) {
  return (
    <TB.Trigger
      className={cn(
        "relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground data-[state=active]:border-signal data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="tabular rounded bg-muted px-1 text-[11px] text-muted-foreground">{count}</span>}
    </TB.Trigger>
  );
}

/* ───────────── Segmented control ───────────── */
export function Segmented<T extends string>({ value, onChange, options, className, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label?: React.ReactNode; icon?: React.ReactNode; title?: string }[]; className?: string; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex h-8 items-center rounded-md border border-border bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            title={o.title}
            aria-label={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-[5px] px-2 text-xs font-medium text-muted-foreground transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
              active ? "bg-surface text-foreground shadow-sm" : "hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Skeleton ───────────── */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-shimmer rounded-md bg-muted", className)} {...props} />;
}
