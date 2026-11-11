"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChartColumn, ArrowLeft, Flag, Plug, ScrollText, Settings, Users, LogOut, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/shell/brand-mark";
import { signOut } from "@/lib/session";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: ChartColumn },
  { href: "/admin/companies", label: "Companies", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/features", label: "Features", icon: Flag },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/ai", label: "AI usage", icon: Sparkles },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/settings", label: "Platform settings", icon: Settings },
];

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh border-t-2 border-signal">
      <aside className="sticky top-0 hidden h-[calc(100dvh-2px)] w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="px-4 pb-2 pt-4">
          <BrandLogo height={20} />
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-signal-soft px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[color-mix(in_oklch,var(--signal),black_25%)] dark:text-signal">Platform admin</p>
        </div>
        <nav aria-label="Administration" className="flex-1 space-y-0.5 px-2.5 pt-3">
          {NAV.map((n) => {
            const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium", active ? "bg-sidebar-active text-foreground shadow-sm" : "text-sidebar-foreground hover:bg-accent hover:text-foreground")}>
                <n.icon className="size-4 text-subtle-foreground" />{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-border p-2.5">
          <Link href="/app" className="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-accent"><ArrowLeft className="size-4" />My companies</Link>
          <button onClick={() => signOut()} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-accent"><LogOut className="size-4" />Sign out</button>
          <p className="truncate px-2 text-[11px] text-subtle-foreground">{email}</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="shrink-0 rounded-md px-2 py-1 text-sm hover:bg-accent">{n.label}</Link>)}
        </div>
        <main className="mx-auto max-w-6xl p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

export function AdminHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
