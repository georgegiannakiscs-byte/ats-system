"use client";
import { ArrowRight, MapPin } from "lucide-react";
import { careersThemeVars, type CareersTheme } from "@/lib/careers-theme";
import { fontFamilyFor } from "@/lib/careers-fonts";
import { cn } from "@/lib/utils";

/** Miniature careers page rendered with the theme being edited, so changes are visible before saving. */
export function CareersPreview({ theme, name, logoUrl, headline, intro, benefits, layout }: {
  theme: CareersTheme; name: string; logoUrl: string | null; headline: string; intro: string; benefits: string[]; layout: "list" | "grid";
}) {
  const vars = careersThemeVars(theme, fontFamilyFor) as React.CSSProperties;
  const band = theme.hero === "band";
  const jobs = [{ title: "Senior Data Analyst", place: "Athens · Hybrid" }, { title: "Product Designer", place: "Remote · Full-time" }];
  return (
    <div style={vars} aria-label="Careers page preview" role="img" className="overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xs [font-family:var(--font-geist-sans)]">
      <div className="flex h-11 items-center border-b border-border bg-surface/80 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl ? <img src={logoUrl} alt="" className="h-6 max-w-32 object-contain" /> : <span className="font-display text-sm font-semibold">{name}</span>}
        <span className="ml-auto text-[10px] text-muted-foreground">EN · ΕΛ</span>
      </div>
      <div className={band ? "bg-primary text-primary-foreground" : undefined}>
        <div className={cn("px-5", band ? "py-7" : "pb-3 pt-6")}>
          <span aria-hidden className="mb-3 block h-1 w-8 rounded-full bg-[var(--careers-accent)]" />
          <p className="font-display text-2xl leading-tight tracking-tight">{headline || `Careers at ${name}`}</p>
          {intro && <p className={cn("mt-2 line-clamp-2 text-xs leading-relaxed", band ? "opacity-90" : "text-foreground/80")}>{intro}</p>}
          {benefits.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {benefits.slice(0, 3).map((b) => (
                <span key={b} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]", band ? "border-current/25 bg-current/5" : "border-border bg-surface")}>
                  <span className="size-1 rounded-full bg-[var(--careers-accent)]" />{b}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={cn("px-5 pb-5", band ? "pt-4" : "pt-1")}>
        <p className="mb-2 text-xs font-semibold">Open positions <span className="text-muted-foreground">2</span></p>
        <div className={layout === "grid" ? "grid grid-cols-2 gap-2" : "divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"}>
          {jobs.map((j) => (
            <div key={j.title} className={cn("flex items-center gap-2 px-3 py-2.5", layout === "grid" && "rounded-lg border border-border bg-surface")}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{j.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="size-2.5" />{j.place}</p>
              </div>
              <ArrowRight className="size-3 text-subtle-foreground" />
            </div>
          ))}
        </div>
        <span className="mt-3 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">Apply now</span>
      </div>
    </div>
  );
}
