"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDb } from "@/lib/api/store";
import { usePageMeta } from "@/components/shell/page-meta";
import { JobForm } from "@/components/jobs/job-form";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function EditJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const db = useDb();
  const job = db.jobs.find((j) => j.id === jobId);
  usePageMeta("Edit job", [{ label: "Jobs", href: "/jobs" }, ...(job ? [{ label: job.title, href: `/jobs/${job.id}` }] : [])]);
  if (!job) return <EmptyState title="Job not found" action={<Button asChild variant="outline"><Link href="/jobs">Back to jobs</Link></Button>} />;
  return <JobForm key={job.id} job={job} />;
}
