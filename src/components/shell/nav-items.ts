import { orgPath } from "@/lib/org-path";
import { BriefcaseBusiness, CalendarDays, ChartColumn, LayoutGrid, Library, ListChecks, Settings, Users } from "lucide-react";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid, shortcut: "G O" },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness, shortcut: "G J" },
  { href: "/candidates", label: "Candidates", icon: Users, shortcut: "G C" },
  { href: "/talent-pool", label: "Talent Pool", icon: Library, shortcut: "G P" },
  { href: "/interviews", label: "Interviews", icon: CalendarDays, shortcut: "G I" },
  { href: "/tasks", label: "Tasks", icon: ListChecks, shortcut: "G T" },
  { href: "/analytics", label: "Analytics", icon: ChartColumn, shortcut: "G A" },
] as const;

export const SETTINGS_NAV = { href: "/settings", label: "Settings", icon: Settings, shortcut: "G S" } as const;

export function isActive(pathname: string, href: string) {
  const full = orgPath(href);
  return pathname === full || pathname.startsWith(full + "/");
}
