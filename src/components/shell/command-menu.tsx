"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog as D } from "radix-ui";
import { BriefcaseBusiness, CalendarPlus, ListChecks, Moon, Sun, UserPlus, CornerDownLeft } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useDb } from "@/lib/api/store";
import { fullName, primaryApplication } from "@/lib/api/selectors";
import { NAV, SETTINGS_NAV } from "./nav-items";
import { useUI } from "./ui-context";
import { JobStatusBadge } from "@/components/common/badges";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDb();
  const router = useRouter();
  const ui = useUI();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = React.useState("");

  const run = (fn: () => void) => {
    onOpenChange(false);
    setQuery("");
    // let the dialog close before opening another overlay
    setTimeout(fn, 10);
  };

  const showPeople = query.trim().length > 0;
  const jobsById = React.useMemo(() => new Map(db.jobs.map((j) => [j.id, j])), [db.jobs]);

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.01_70/0.22)] data-[state=open]:animate-in data-[state=open]:fade-in-0 dark:bg-black/50" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 duration-150">
          <D.Title className="sr-only">Search and commands</D.Title>
          <D.Description className="sr-only">Search candidates, jobs and pages, or run a command.</D.Description>
          <Command loop>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search candidates, jobs, or type a command…" />
            <CommandList>
              <CommandEmpty>No results for “{query}”.</CommandEmpty>
              {showPeople && (
                <CommandGroup heading="Candidates">
                  {db.candidates.map((c) => {
                    const app = primaryApplication(db, c.id);
                    const job = app ? jobsById.get(app.jobId) : undefined;
                    return (
                      <CommandItem key={c.id} value={`${fullName(c)} ${c.headline} ${c.email} ${c.id}`} onSelect={() => run(() => ui.openCandidate(c.id))}>
                        <Avatar name={fullName(c)} hue={c.hue} size="xs" />
                        <span className="truncate">{fullName(c)}</span>
                        <span className="truncate text-xs text-muted-foreground">{c.headline}</span>
                        {job && <span className="ml-auto shrink-0 truncate text-xs text-subtle-foreground">{job.title}</span>}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {showPeople && (
                <CommandGroup heading="Jobs">
                  {db.jobs.map((j) => (
                    <CommandItem key={j.id} value={`${j.title} ${j.department} ${j.location} ${j.id}`} onSelect={() => run(() => router.push(`/jobs/view?id=${j.id}`))}>
                      <BriefcaseBusiness />
                      <span className="truncate">{j.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{j.department} · {j.location}</span>
                      <span className="ml-auto"><JobStatusBadge status={j.status} /></span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showPeople && (
                <CommandGroup heading="Team">
                  {db.team.map((m) => (
                    <CommandItem key={m.id} value={`${m.name} ${m.title} ${m.role} ${m.id}`} onSelect={() => run(() => router.push("/settings?section=team"))}>
                      <Avatar name={m.name} hue={m.hue} size="xs" />
                      <span className="truncate">{m.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{m.title}</span>
                      <span className="ml-auto text-xs text-subtle-foreground">{m.role}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Quick actions">
                <CommandItem onSelect={() => run(() => router.push("/jobs/new"))}><BriefcaseBusiness />Create job</CommandItem>
                <CommandItem onSelect={() => run(() => ui.addCandidate())}><UserPlus />Add candidate</CommandItem>
                <CommandItem onSelect={() => run(() => ui.scheduleInterview())}><CalendarPlus />Schedule interview</CommandItem>
                <CommandItem onSelect={() => run(() => ui.openTask())}><ListChecks />Create task</CommandItem>
                <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />}Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Go to">
                {[...NAV, SETTINGS_NAV].map((n) => (
                  <CommandItem key={n.href} value={`go ${n.label}`} onSelect={() => run(() => router.push(n.href))}>
                    <n.icon />
                    {n.label}
                    <span className="ml-auto flex gap-0.5">{n.shortcut.split(" ").map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="flex items-center gap-3 border-t border-border bg-surface-2/60 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
              <span className="flex items-center gap-1"><Kbd><CornerDownLeft className="size-2.5" /></Kbd> select</span>
              <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
              {!showPeople && <span className="ml-auto">Type to search people &amp; jobs</span>}
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
