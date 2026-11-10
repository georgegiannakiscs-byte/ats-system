"use client";
import Link from "next/link";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { UserX } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { usePageMeta } from "@/components/shell/page-meta";
import { CandidateHeader, CandidateTabs, useCandidateApplication } from "@/components/candidates/candidate-profile";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { fullName } from "@/lib/api/selectors";

export default function CandidatePage() {
  return (
    <React.Suspense>
      <CandidatePageInner />
    </React.Suspense>
  );
}

function CandidatePageInner() {
  const candidateId = useSearchParams().get("id") ?? "";
  const db = useDb();
  const candidate = db.candidates.find((c) => c.id === candidateId);
  const { app, setAppId } = useCandidateApplication(candidateId);
  const job = app ? db.jobs.find((j) => j.id === app.jobId) : undefined;
  usePageMeta(candidate ? fullName(candidate) : "Candidate not found", job ? [{ label: "Jobs", href: "/jobs" }, { label: job.title, href: `/jobs/view?id=${job.id}` }] : [{ label: "Candidates", href: "/candidates" }]);
  if (!candidate)
    return <EmptyState icon={<UserX />} title="Candidate not found" description="This profile may have been removed." action={<Button asChild variant="outline"><Link href="/candidates">Back to candidates</Link></Button>} />;
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
        <CandidateHeader candidate={candidate} app={app} onSelectApp={setAppId} />
      </div>
      <div className="mt-6">
        <CandidateTabs candidate={candidate} app={app} />
      </div>
    </div>
  );
}
