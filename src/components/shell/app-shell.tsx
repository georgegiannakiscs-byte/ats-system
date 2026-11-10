"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { useDbOrNull } from "@/lib/api/store";
import { Skeleton } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogHeader } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";
import { PageMetaProvider } from "./page-meta";
import { UIProvider, useUI } from "./ui-context";
import { Sidebar, SidebarNav, WorkspaceSwitcher, ShortcutRow } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandMenu } from "./command-menu";
import { NAV, SETTINGS_NAV } from "./nav-items";
import { NavLinkMobileSettings } from "./mobile-settings-link";

const SIDEBAR_KEY = "elan.ui.sidebar-collapsed";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || !!t.closest("[role=dialog],[role=menu],[role=listbox]"));
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const router = useRouter();
  const ui = useUI();

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {}
    ui.registerCommand(() => setCommandOpen(true));
  }, [ui]);

  const toggle = React.useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }, []);

  // Global keyboard shortcuts
  React.useEffect(() => {
    let gPressed = 0;
    const goto: Record<string, string> = Object.fromEntries([...NAV, SETTINGS_NAV].map((n) => [n.shortcut.split(" ")[1].toLowerCase(), n.href]));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (Date.now() - gPressed < 900 && goto[k]) {
        e.preventDefault();
        gPressed = 0;
        router.push(goto[k]);
        return;
      }
      if (k === "g") gPressed = Date.now();
      else if (e.key === "[") toggle();
      else if (e.key === "?") setShortcutsOpen(true);
      else if (k === "c") (document.querySelector("[data-quick-add]") as HTMLButtonElement | null)?.click();
      else if (e.key === "/") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, toggle]);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to content</a>
      <Sidebar collapsed={collapsed} onToggle={toggle} onShowShortcuts={() => setShortcutsOpen(true)} />

      {/* Mobile navigation drawer */}
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-left-10 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left-10 duration-200 lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation</D.Description>
            <div className="flex h-12 items-center gap-1 px-2.5">
              <WorkspaceSwitcher />
              <D.Close className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Close navigation"><X className="size-4" /></D.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-2.5 pt-3">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-border p-2.5">
              <NavLinkMobileSettings onNavigate={() => setMobileOpen(false)} />
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} onShowShortcuts={() => setShortcutsOpen(true)} />
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent size="sm">
          <DialogHeader title="Keyboard shortcuts" description="Move faster without the mouse." />
          <DialogBody className="divide-y divide-border py-2">
            <ShortcutRow keys={["⌘", "K"]} label="Search & commands" />
            <ShortcutRow keys={["C"]} label="Create…" />
            <ShortcutRow keys={["["]} label="Toggle sidebar" />
            {[...NAV, SETTINGS_NAV].map((n) => (
              <ShortcutRow key={n.href} keys={n.shortcut.split(" ")} label={`Go to ${n.label}`} />
            ))}
            <ShortcutRow keys={["?"]} label="Show shortcuts" />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Shows a calm skeleton until the local demo database is loaded in the browser. */
function DataGate({ children }: { children: React.ReactNode }) {
  const db = useDbOrNull();
  if (!db) return <ShellSkeleton />;
  return <>{children}</>;
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-[232px] shrink-0 flex-col gap-2 border-r border-border bg-sidebar p-3 lg:flex">
        <Skeleton className="h-8 w-40" />
        <div className="mt-4 flex flex-col gap-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-6" style={{ width: `${60 + ((i * 17) % 30)}%` }} />)}</div>
      </aside>
      <div className="flex-1">
        <div className="flex h-12 items-center border-b border-border px-4"><Skeleton className="h-4 w-32" /></div>
        <PageSkeleton />
      </div>
    </div>
  );
}

export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto max-w-[1400px] p-4 sm:p-6", className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-64" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DataGate>
      <PageMetaProvider>
        <UIProvider>
          <ShellInner>{children}</ShellInner>
        </UIProvider>
      </PageMetaProvider>
    </DataGate>
  );
}
