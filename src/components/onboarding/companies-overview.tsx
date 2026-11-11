"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarClock, CircleAlert, Inbox, ListChecks, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/controls";
import { CompanyLogo } from "@/components/shell/company-switcher";
import { EmptyState } from "@/components/common/empty-state";
import { PlainTopBar } from "./top-bar";
import { cn } from "@/lib/utils";

type Company = { id: string; slug: string; name: string; status: string; role: string; logoUrl: string | null; primaryColor: string; stats: Record<string, number> | null };

/** "All my companies" - counts per company, each computed under that company's own access rules. */
export function CompaniesOverview({ suspended }: { suspended?: string }) {
  const [data, setData] = React.useState<Company[] | null>(null);
  React.useEffect(() => {
    document.title = "My companies · Ulysse";
    apiFetch<{ companies: Company[] }>("/api/overview").then((d) => setData(d.companies)).catch(() => setData([]));
  }, []);
  const totals = data?.reduce((t, c) => ({ jobs: t.jobs + (c.stats?.active_jobs ?? 0), apps: t.apps + (c.stats?.new_applications ?? 0), attention: t.attention + (c.stats?.awaiting_review ?? 0) + (c.stats?.overdue_tasks ?? 0) }), { jobs: 0, apps: 0, attention: 0 });
  return (
    <div className="min-h-dvh">
      <PlainTopBar />
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        {suspended && <p className="mb-4 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">{suspended} is currently suspended. Contact Ulysse support to restore access.</p>}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-tight">My companies</h1>
            {totals && data!.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{data!.length} companies · {totals.jobs} active jobs · {totals.apps} new applications this week · {totals.attention} items need attention</p>}
          </div>
          <Button asChild><Link href="/app/new"><Plus />Add company</Link></Button>
        </div>
        {!data ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</div>
        ) : data.length === 0 ? (
          <div className="mt-8 rounded-xl border border-border bg-surface shadow-xs">
            <EmptyState icon={<BriefcaseBusiness />} title="Set up your first company" description="Each company gets its own jobs, candidates, team and careers page. You can manage as many as you need from this one account." action={<Button asChild><Link href="/app/new"><Plus />Create a company</Link></Button>} />
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => {
              const attention = (c.stats?.awaiting_review ?? 0) + (c.stats?.overdue_tasks ?? 0);
              return (
                <li key={c.id}>
                  <Link href={c.status === "active" ? `/app/${c.slug}/dashboard` : "#"} aria-disabled={c.status !== "active"} className={cn("group flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-xs transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-sm", c.status !== "active" && "pointer-events-none opacity-60")}>
                    <div className="flex items-center gap-3">
                      <CompanyLogo name={c.name} logoUrl={c.logoUrl} size={40} className="rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium group-hover:underline">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.role}{c.status !== "active" && " · Suspended"}</p>
                      </div>
                      <ArrowRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    {c.stats && (
                      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2"><BriefcaseBusiness className="size-3.5 text-muted-foreground" /><dt className="sr-only">Active jobs</dt><dd><span className="tabular font-semibold">{c.stats.active_jobs}</span> <span className="text-muted-foreground">active jobs</span></dd></div>
                        <div className="flex items-center gap-2"><Inbox className="size-3.5 text-muted-foreground" /><dt className="sr-only">New applications</dt><dd><span className="tabular font-semibold">{c.stats.new_applications}</span> <span className="text-muted-foreground">new (7d)</span></dd></div>
                        <div className="flex items-center gap-2"><ListChecks className="size-3.5 text-muted-foreground" /><dt className="sr-only">Open tasks</dt><dd><span className="tabular font-semibold">{c.stats.open_tasks}</span> <span className="text-muted-foreground">open tasks</span></dd></div>
                        <div className="flex items-center gap-2"><CalendarClock className="size-3.5 text-muted-foreground" /><dt className="sr-only">Upcoming interviews</dt><dd><span className="tabular font-semibold">{c.stats.upcoming_interviews}</span> <span className="text-muted-foreground">interviews</span></dd></div>
                      </dl>
                    )}
                    {attention > 0 && <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-signal"><CircleAlert className="size-3.5" />{attention} item{attention === 1 ? "" : "s"} need attention</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
