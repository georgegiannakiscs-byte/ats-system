"use client";
import { Avatar } from "@/components/ui/avatar";
import { useDb } from "@/lib/api/store";
import { cn } from "@/lib/utils";

export function Person({ id, size = "xs", className, showName = true }: { id: string; size?: "xs" | "sm" | "md"; className?: string; showName?: boolean }) {
  const db = useDb();
  const m = db.team.find((t) => t.id === id);
  if (!m) return <span className="text-xs text-subtle-foreground">Unassigned</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Avatar name={m.name} hue={m.hue} size={size} />
      {showName && <span className="truncate text-sm text-foreground/85">{m.name}</span>}
    </span>
  );
}
