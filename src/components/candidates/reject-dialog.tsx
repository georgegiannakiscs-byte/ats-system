"use client";
import * as React from "react";
import { UserX } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Checkbox, Select } from "@/components/ui/controls";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { REJECTION_REASONS } from "@/lib/constants";
import type { ID } from "@/lib/types";
import { fullName } from "@/lib/api/selectors";

export function RejectDialog({ applicationId, onClose }: { applicationId: ID | null; onClose: () => void }) {
  return (
    <Dialog open={!!applicationId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">{applicationId && <RejectForm applicationId={applicationId} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function RejectForm({ applicationId, onClose }: { applicationId: ID; onClose: () => void }) {
  const db = useDb();
  const app = db.applications.find((a) => a.id === applicationId);
  const [reason, setReason] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [pool, setPool] = React.useState(true);
  const [submitted, setSubmitted] = React.useState(false);
  if (!app) return null;
  const c = db.candidates.find((x) => x.id === app.candidateId)!;
  const job = db.jobs.find((j) => j.id === app.jobId)!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!reason) return;
    await api.applications.reject(app.id, details ? `${reason} — ${details}` : reason, pool);
    toast(`${fullName(c)} was rejected`, {
      description: pool ? "Kept in the talent pool for future roles." : undefined,
      action: { label: "Undo", onClick: () => api.applications.restore(app.id) },
    });
    onClose();
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader icon={<UserX />} title={`Reject ${fullName(c)}?`} description={`From ${job.title}. The candidate leaves the active pipeline.`} />
      <DialogBody className="space-y-4">
        <Field label="Reason" required error={submitted && !reason ? "Select a reason — it powers your analytics." : undefined}>
          <Select value={reason} onValueChange={setReason} placeholder="Choose a reason" invalid={submitted && !reason} options={REJECTION_REASONS.map((r) => ({ value: r, label: r }))} />
        </Field>
        <Field label="Internal note" hint="Only visible to your team.">
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} className="min-h-16" />
        </Field>
        <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 text-sm">
          <Checkbox checked={pool} onCheckedChange={(v) => setPool(!!v)} className="mt-0.5" />
          <span>
            <span className="font-medium">Keep in talent pool</span>
            <span className="block text-xs text-muted-foreground">Re-engage them for future openings.</span>
          </span>
        </label>
        <p className="text-xs text-muted-foreground">No rejection email is sent in the demo. Use “Send email” to draft one.</p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="destructive">Reject candidate</Button>
      </DialogFooter>
    </form>
  );
}
