import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Clearly marks simulated behaviour or demo data. */
export function DemoLabel({ children = "Demo", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-[5px] border border-dashed border-border-strong px-1.5 text-[11px] font-medium text-muted-foreground", className)}>
      <FlaskConical className="size-3" aria-hidden />
      {children}
    </span>
  );
}
