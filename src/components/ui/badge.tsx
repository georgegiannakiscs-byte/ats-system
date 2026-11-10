import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] border font-medium [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "border-border bg-surface-2 text-foreground/80",
      muted: "border-transparent bg-muted text-muted-foreground",
      brand: "border-transparent bg-brand-soft text-brand-soft-foreground",
      success: "border-transparent bg-success-soft text-success",
      warning: "border-transparent bg-warning-soft text-[color-mix(in_oklch,var(--warning),black_25%)] dark:text-warning",
      danger: "border-transparent bg-destructive-soft text-destructive",
      outline: "border-border bg-transparent text-muted-foreground",
    },
    size: { sm: "h-5 px-1.5 text-[11px]", md: "h-6 px-2 text-xs" },
  },
  defaultVariants: { tone: "neutral", size: "sm" },
});

export function Badge({ className, tone, size, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/** A small status indicator: coloured dot + label. Never colour alone. */
export function StatusDot({ color, label, className }: { color: string; label?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-foreground/80", className)}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
