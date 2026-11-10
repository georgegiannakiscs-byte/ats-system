"use client";
import { usePageMeta } from "@/components/shell/page-meta";
import { JobForm } from "@/components/jobs/job-form";

export default function NewJobPage() {
  usePageMeta("New job", [{ label: "Jobs", href: "/jobs" }]);
  return <JobForm />;
}
