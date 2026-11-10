"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Ellipsis, Link2, Pause, Pencil, Send, Trash2, Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import type { Job, JobStatus } from "@/lib/types";
import { useDb } from "@/lib/api/store";

export function useJobStatusChange() {
  return (job: Job, status: JobStatus) => {
    const prev = job.status;
    api.jobs.setStatus(job.id, status);
    const msg = { published: "published to your careers page", on_hold: "put on hold", closed: "closed", draft: "moved to drafts" }[status];
    toast.success(`${job.title} ${msg}`, {
      description: status === "published" ? "Demo: visible on the internal careers page preview only. External job boards are not contacted." : undefined,
      action: { label: "Undo", onClick: () => api.jobs.setStatus(job.id, prev) },
    });
  };
}

export function JobActionsMenu({ job, trigger = "icon", afterDelete }: { job: Job; trigger?: "icon" | "button"; afterDelete?: () => void }) {
  const router = useRouter();
  const db = useDb();
  const setStatus = useJobStatusChange();
  const [confirm, setConfirm] = React.useState<null | "delete" | "close">(null);
  const count = db.applications.filter((a) => a.jobId === job.id).length;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger === "icon" ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${job.title}`} onClick={(e) => e.stopPropagation()}><Ellipsis /></Button>
          ) : (
            <Button variant="outline" size="icon-sm" aria-label="More job actions"><Ellipsis /></Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem asChild><Link href={`/jobs/${job.id}/edit`}><Pencil />Edit job</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={async () => { const j = await api.jobs.duplicate(job.id); toast.success("Job duplicated as draft", { action: { label: "Open", onClick: () => router.push(`/jobs/${j.id}/edit`) } }); }}><Copy />Duplicate</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(`${db.company.careersUrl}/jobs/${job.id}`).then(() => toast.success("Careers link copied", { description: "Demo URL — the careers site isn't live yet." }))}><Link2 />Copy careers link</DropdownMenuItem>
          <DropdownMenuSeparator />
          {job.status !== "published" && <DropdownMenuItem onSelect={() => setStatus(job, "published")}><Send />{job.status === "closed" ? "Reopen & publish" : "Publish"}</DropdownMenuItem>}
          {job.status === "published" && <DropdownMenuItem onSelect={() => setStatus(job, "on_hold")}><Pause />Put on hold</DropdownMenuItem>}
          {job.status === "closed" && <DropdownMenuItem onSelect={() => setStatus(job, "draft")}><RotateCcw />Move to drafts</DropdownMenuItem>}
          {job.status !== "closed" && <DropdownMenuItem onSelect={() => setConfirm("close")}><Archive />Close job</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirm("delete")}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === "close"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Close ${job.title}?`}
        description="The job will be unpublished. Candidates stay in the pipeline and you can reopen it at any time."
        confirmLabel="Close job"
        onConfirm={() => setStatus(job, "closed")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${job.title}?`}
        description={count ? `This permanently removes the job and ${count} application${count > 1 ? "s" : ""} (candidate profiles are kept). This can't be undone.` : "This permanently removes the job. This can't be undone."}
        confirmLabel="Delete job"
        destructive
        onConfirm={() => {
          api.jobs.remove(job.id);
          toast("Job deleted");
          afterDelete?.();
        }}
      />
    </>
  );
}
