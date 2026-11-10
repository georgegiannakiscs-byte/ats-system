"use client";
import Link from "next/link";
import * as React from "react";
import { clearWorkspace, loadWorkspace, type ApiError } from "@/lib/api/store";
import { setOrgSlug } from "@/lib/org-path";
import { AppShell, ShellSkeleton } from "./app-shell";

/** Loads one company's workspace. Keyed by org ID in the layout, so switching companies remounts everything. */
export function WorkspaceShell({ orgId, slug, children }: { orgId: string; slug: string; children: React.ReactNode }) {
  setOrgSlug(slug);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    clearWorkspace();
    loadWorkspace(orgId)
      .then(() => alive && setReady(true))
      .catch((e: ApiError) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [orgId]);
  if (error)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">We couldn&apos;t open this workspace</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link href="/app" className="mt-2 text-sm text-brand underline-offset-2 hover:underline">Back to my companies</Link>
      </div>
    );
  if (!ready) return <ShellSkeleton />;
  return <AppShell>{children}</AppShell>;
}
