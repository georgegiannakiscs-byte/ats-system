"use client";
import { orgPath } from "@/lib/org-path";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDb } from "@/lib/api/store";
import { BrandLogo } from "./brand-mark";
import { BRAND } from "@/config/brand";
import { NAV, SETTINGS_NAV, isActive } from "./nav-items";
import { useDbOrNull } from "@/lib/api/store";
import { Tooltip } from "@/components/ui/overlays";
import { Kbd } from "@/components/ui/input";
import { upcomingInterviews } from "@/lib/api/selectors";
import { isToday } from "date-fns";

export function useNavBadges() {
  const db = useDb();
  return React.useMemo(() => {
    const overdue = db.tasks.filter((t) => !t.done && t.assigneeId === db.currentUserId && new Date(t.dueDate) < new Date()).length;
    const today = upcomingInterviews(db).filter((i) => isToday(new Date(i.start))).length;
    return { "/tasks": overdue ? { n: overdue, tone: "danger" as const, label: `${overdue} overdue` } : undefined, "/interviews": today ? { n: today, tone: "neutral" as const, label: `${today} today` } : undefined } as Record<string, { n: number; tone: "danger" | "neutral"; label: string } | undefined>;
  }, [db]);
}

import { CompanySwitcher as WorkspaceSwitcher } from "./company-switcher";
export { WorkspaceSwitcher };

function NavLink({ href, label, icon: Icon, collapsed, shortcut, onNavigate }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; collapsed?: boolean; shortcut?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  const badge = useNavBadges()[href];
  const link = (
    <Link
      href={orgPath(href)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium outline-none transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-sidebar-active text-foreground shadow-sm" : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <span className="absolute -left-2.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-signal" aria-hidden />}
      <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-foreground" : "text-subtle-foreground group-hover:text-muted-foreground")} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {badge && !collapsed && (
        <span title={badge.label} className={cn("tabular rounded px-1.5 text-[11px] font-semibold leading-[18px]", badge.tone === "danger" ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground")}>
          {badge.n}
        </span>
      )}
      {badge && collapsed && <span className={cn("absolute right-1 top-1 size-1.5 rounded-full", badge.tone === "danger" ? "bg-destructive" : "bg-signal")} aria-label={badge.label} />}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip content={label} side="right" shortcut={shortcut}>
      {link}
    </Tooltip>
  );
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const db = useDbOrNull();
  const items = NAV.filter((i) => (!i.permission || db?.org.permissions.includes(i.permission)) && (!i.feature || db?.org.features[i.feature] !== false));
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavLink key={item.href} {...item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle, onShowShortcuts }: { collapsed: boolean; onToggle: () => void; onShowShortcuts: () => void }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[60px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-14 items-center px-4", collapsed && "justify-center px-2")}>
        <Link href={orgPath("/")} aria-label="Overview" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandLogo height={collapsed ? 22 : 21} variant={collapsed ? "monogram" : "wordmark"} />
        </Link>
      </div>
      <div className={cn("px-2.5", collapsed && "px-2")}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>
      <div className={cn("flex-1 overflow-y-auto overflow-x-hidden px-2.5 pt-3 scrollbar-none", collapsed && "px-2")}>
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn("flex flex-col gap-0.5 border-t border-border px-2.5 py-2", collapsed && "px-2")}>
        <NavLink {...SETTINGS_NAV} collapsed={collapsed} />
        {!collapsed && (
          <div className="mt-1 flex items-center justify-between px-2 py-1">
            <span className="truncate text-[11px] text-subtle-foreground">{BRAND.name}</span>
            <div className="flex">
              <Tooltip content="Keyboard shortcuts" shortcut="?">
                <button onClick={onShowShortcuts} aria-label="Keyboard shortcuts" className="flex size-7 items-center justify-center rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground">
                  <Keyboard className="size-4" />
                </button>
              </Tooltip>
              <Tooltip content="Collapse sidebar" shortcut="[">
                <button onClick={onToggle} aria-label="Collapse sidebar" className="flex size-7 items-center justify-center rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground">
                  <PanelLeft className="size-4" />
                </button>
              </Tooltip>
            </div>
          </div>
        )}
        {collapsed && (
          <Tooltip content="Expand sidebar" side="right" shortcut="[">
            <button onClick={onToggle} aria-label="Expand sidebar" className="flex h-8 items-center justify-center rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground">
              <PanelLeft className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>
    </aside>
  );
}

export function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-foreground/85">{label}</span>
      <span className="flex gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
    </div>
  );
}
