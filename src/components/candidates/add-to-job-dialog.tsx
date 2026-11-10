"use client";
import * as React from "react";
import { BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { JobPicker } from "@/components/common/pickers";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import type { ID } from "@/lib/types";
import { plural } from "@/lib/utils";

export function AddToJobDialog({ candidateIds, onClose }: { candidateIds: ID[] | null; onClose: () => void }) {
  const db = useDb();
  const [jobId, setJobId] = React.useState<ID>();
  const [error, setError] = React.useState<string>();
  React.useEffect(() => {
    setJobId(undefined);
    setError(undefined);
  }, [candidateIds]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId || !candidateIds) return setError("Choose a job");
    let added = 0;
    let skipped = 0;
    for (const id of candidateIds) {
      try {
        await api.applications.create(id, jobId);
        added++;
      } catch {
        skipped++;
      }
    }
    const job = db.jobs.find((j) => j.id === jobId)!;
    if (added) toast.success(`${plural(added, "candidate")} added to ${job.title}`, { description: skipped ? `${skipped} already in this pipeline` : "They start in Applied." });
    else toast.error("Already in this pipeline");
    onClose();
  };
  return (
    <Dialog open={!!candidateIds} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader icon={<BriefcaseBusiness />} title="Add to job" description={candidateIds ? `${plural(candidateIds.length, "candidate")} selected` : undefined} />
          <DialogBody>
            <Field label="Job" required error={error}>
              <JobPicker value={jobId} onChange={(v) => (setJobId(v), setError(undefined))} openOnly invalid={!!error} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Add to pipeline</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
