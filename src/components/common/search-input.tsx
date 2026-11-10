"use client";
import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputBase } from "@/components/ui/input";

export function SearchInput({ value, onChange, placeholder = "Search…", className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" />
      <input
        ref={ref}
        type="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && (e.stopPropagation(), onChange(""))}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(inputBase, "h-8 pl-8 pr-7 [&::-webkit-search-cancel-button]:hidden")}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => (onChange(""), ref.current?.focus())} className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-subtle-foreground hover:bg-accent hover:text-foreground">
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
