import type { CSSProperties } from "react";
import { cn, initials } from "@/lib/utils";

const sizes = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm", xl: "size-14 text-lg" };

/** Subtle tinted initials avatar — consistent everywhere, adapts to dark mode. */
export function Avatar({ name, hue = 260, size = "sm", className, ring }: { name: string; hue?: number; size?: keyof typeof sizes; className?: string; ring?: boolean }) {
  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight",
        "bg-[oklch(0.935_0.03_var(--h))] text-[oklch(0.43_0.09_var(--h))] dark:bg-[oklch(0.32_0.045_var(--h))] dark:text-[oklch(0.86_0.07_var(--h))]",
        sizes[size],
        ring && "ring-2 ring-surface",
        className,
      )}
      style={{ "--h": hue } as CSSProperties}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 3, size = "xs" }: { people: { name: string; hue: number }[]; max?: number; size?: keyof typeof sizes }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex -space-x-1.5" aria-label={people.map((p) => p.name).join(", ")}>
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} hue={p.hue} size={size} ring />
      ))}
      {rest > 0 && <span className={cn("inline-flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-2 ring-surface", sizes[size])}>+{rest}</span>}
    </span>
  );
}
