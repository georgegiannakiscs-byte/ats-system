"use client";
import { orgPath } from "@/lib/org-path";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ShieldCheck, LayoutGrid, LockKeyhole } from "lucide-react";
import { useMe, signOut } from "@/lib/session";
import { Bell, BriefcaseBusiness, CalendarPlus, ChevronRight, ListChecks, LogOut, Menu, Monitor, Moon, Plus, Search, Settings, Sun, UserPlus, Keyboard, User, CheckCheck } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip, PopoverClose } from "@/components/ui/overlays";
import { usePageMetaValue } from "./page-meta";
import { useUI } from "./ui-context";

export function Topbar({ onOpenMobileNav, onShowShortcuts }: { onOpenMobileNav: () => void; onShowShortcuts: () => void }) {
  const { title, crumbs } = usePageMetaValue();
  const ui = useUI();
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-4">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu />
      </Button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {c.href ? (
              <Link href={c.href} className="hidden shrink-0 truncate rounded px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline">
                {c.label}
              </Link>
            ) : (
              <span className="hidden shrink-0 px-1 text-muted-foreground sm:inline">{c.label}</span>
            )}
            <ChevronRight className="hidden size-3.5 shrink-0 text-subtle-foreground sm:block" aria-hidden />
          </React.Fragment>
        ))}
        <h1 className="truncate px-1 font-semibold tracking-tight">{title}</h1>
      </nav>

      <button
        onClick={ui.openCommand}
        className="group hidden h-8 w-56 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-subtle-foreground shadow-xs transition-colors hover:border-border-strong hover:text-muted-foreground md:flex xl:w-72"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <span className="flex gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      </button>
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={ui.openCommand} aria-label="Search">
        <Search />
      </Button>

      <QuickAdd />
      <Notifications />
      <UserMenu onShowShortcuts={onShowShortcuts} />
    </header>
  );
}

function QuickAdd() {
  const ui = useUI();
  const router = useRouter();
  return (
    <DropdownMenu>
      <Tooltip content="Create" shortcut="C">
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" aria-label="Create new" data-quick-add>
            <Plus />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push(orgPath("/jobs/new"))} shortcut="J"><BriefcaseBusiness />New job</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ui.addCandidate()} shortcut="A"><UserPlus />Add candidate</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ui.scheduleInterview()} shortcut="I"><CalendarPlus />Schedule interview</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ui.openTask()} shortcut="T"><ListChecks />New task</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Notifications() {
  const db = useDb();
  const router = useRouter();
  const unread = db.notifications.filter((n) => !n.read).length;
  return (
    <Popover>
      <Tooltip content="Notifications">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative">
            <Bell />
            {unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full border-2 border-background bg-signal" />}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button onClick={() => api.notifications.markAllRead()} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto p-1 scrollbar-thin">
          {db.notifications.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {db.notifications.map((n) => (
            <li key={n.id}>
              <PopoverClose asChild>
                <button
                  onClick={() => {
                    api.notifications.markRead(n.id);
                    router.push(orgPath(n.href));
                  }}
                  className="flex w-full gap-2.5 rounded-md px-2.5 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-signal")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", n.read ? "text-muted-foreground" : "font-medium")}>{n.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-subtle-foreground">{relativeTime(n.createdAt)}</span>
                </button>
              </PopoverClose>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const db = useDb();
  const me = db.team.find((m) => m.id === db.currentUserId) ?? { name: "You", hue: 200, title: "" };
  const session = useMe();
  const isAdmin = !!session?.user.isPlatformAdmin;
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
        <Avatar name={me.name} hue={me.hue} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={me.name} hue={me.hue} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="truncate text-xs text-muted-foreground">{db.org.roleLabel} · {db.org.name}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(orgPath("/settings?section=team"))}><User />Profile &amp; team</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(orgPath("/settings"))} shortcut="G S"><Settings />Settings</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/account")}><LockKeyhole />Account &amp; security</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{theme === "dark" ? <Moon /> : theme === "system" ? <Monitor /> : <Sun />}Theme</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light"><Sun />Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon />Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor />System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={onShowShortcuts} shortcut="?"><Keyboard />Keyboard shortcuts</DropdownMenuItem>
        <DropdownMenuSeparator />
        {isAdmin && <DropdownMenuItem onSelect={() => router.push("/admin")}><ShieldCheck />Platform administration</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => router.push("/app")}><LayoutGrid />All my companies</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
