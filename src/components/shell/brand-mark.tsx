import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Monogram + wordmark. Driven entirely by BRAND so it can be replaced in one place. */
export function BrandMark({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-primary text-primary-foreground shadow-sm">
        <span className="font-display text-[17px] italic leading-none translate-y-[1px]">{BRAND.name.charAt(0)}</span>
        <span className="absolute bottom-[3px] right-[3px] size-[3px] rounded-full bg-brand" aria-hidden />
      </span>
      {!collapsed && <span className="font-display text-[21px] leading-none tracking-tight text-foreground">{BRAND.name}</span>}
    </span>
  );
}
