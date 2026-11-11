"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { careersDict, type CareersLang } from "@/lib/i18n/careers";

export function JobFilters({ lang, jobs, current }: { lang: CareersLang; jobs: { location: string; type: string; department: string }[]; current: { q: string; location: string; type: string; department: string } }) {
  const t = careersDict[lang];
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const uniq = (k: "location" | "type" | "department") => Array.from(new Set(jobs.map((j) => j[k]).filter(Boolean))).sort();
  const sel = "h-10 rounded-md border border-input bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
      <label className="relative">
        <span className="sr-only">{t.search}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
        <input defaultValue={current.q} onChange={(e) => set("q", e.target.value)} placeholder={t.search} className={`${sel} w-full pl-9`} />
      </label>
      <select aria-label={t.allLocations} value={current.location} onChange={(e) => set("location", e.target.value)} className={sel}><option value="">{t.allLocations}</option>{uniq("location").map((v) => <option key={v}>{v}</option>)}</select>
      <select aria-label={t.allTypes} value={current.type} onChange={(e) => set("type", e.target.value)} className={sel}><option value="">{t.allTypes}</option>{uniq("type").map((v) => <option key={v}>{v}</option>)}</select>
      <select aria-label={t.allDepartments} value={current.department} onChange={(e) => set("department", e.target.value)} className={sel}><option value="">{t.allDepartments}</option>{uniq("department").map((v) => <option key={v}>{v}</option>)}</select>
    </div>
  );
}
