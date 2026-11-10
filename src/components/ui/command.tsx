"use client";
import * as React from "react";
import { Command as C } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Word-prefix matching: every typed word must appear in the item's value. Predictable, not fuzzy. */
export function commandFilter(value: string, search: string) {
  const v = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const terms = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  if (!terms.every((t) => v.includes(t))) return 0;
  return terms.every((t) => v.split(/\s+/).some((w) => w.startsWith(t))) ? 1 : 0.5;
}

export function Command({ className, filter = commandFilter, ...props }: React.ComponentProps<typeof C>) {
  return <C filter={filter} className={cn("flex h-full w-full flex-col overflow-hidden bg-popover text-popover-foreground", className)} {...props} />;
}
export function CommandInput({ className, ...props }: React.ComponentProps<typeof C.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3.5">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <C.Input className={cn("h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground", className)} {...props} />
    </div>
  );
}
export function CommandList({ className, ...props }: React.ComponentProps<typeof C.List>) {
  return <C.List className={cn("max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-1.5 scrollbar-thin", className)} {...props} />;
}
export function CommandEmpty(props: React.ComponentProps<typeof C.Empty>) {
  return <C.Empty className="py-10 text-center text-sm text-muted-foreground" {...props} />;
}
export function CommandGroup({ className, ...props }: React.ComponentProps<typeof C.Group>) {
  return <C.Group className={cn("[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground", className)} {...props} />;
}
export function CommandItem({ className, ...props }: React.ComponentProps<typeof C.Item>) {
  return <C.Item className={cn("flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2 text-sm outline-none data-[selected=true]:bg-accent data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground", className)} {...props} />;
}
export const CommandSeparator = C.Separator;
