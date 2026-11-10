"use client";
import * as React from "react";
import { UserPlus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/controls";
import { JobPicker } from "@/components/common/pickers";
import { api } from "@/lib/api";
import { SOURCES } from "@/lib/constants";
import type { ID, Source } from "@/lib/types";
import { useUI } from "@/components/shell/ui-context";

export function AddCandidateDialog({ state, onClose }: { state: { jobId?: ID } | null; onClose: () => void }) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">{state && <Form jobId={state.jobId} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Form({ jobId: initialJob, onClose }: { jobId?: ID; onClose: () => void }) {
  const ui = useUI();
  const [f, setF] = React.useState({ firstName: "", lastName: "", email: "", phone: "", location: "", headline: "", currentCompany: "", linkedinUrl: "", source: "Sourced" as Source, tags: "" });
  const [jobId, setJobId] = React.useState<ID | undefined>(initialJob);
  const [submitted, setSubmitted] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const errors = {
    firstName: !f.firstName.trim() ? "Required" : undefined,
    lastName: !f.lastName.trim() ? "Required" : undefined,
    email: !emailRe.test(f.email) ? "Enter a valid email address" : undefined,
    linkedinUrl: f.linkedinUrl && !/^https?:\/\/(www\.)?linkedin\.com\//.test(f.linkedinUrl) ? "Use a linkedin.com profile URL" : undefined,
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    const c = await api.candidates.create({ ...f, linkedinUrl: f.linkedinUrl || undefined, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), skills: [] }, jobId);
    toast.success(`${c.firstName} ${c.lastName} added`, { description: jobId ? "Added to the Applied stage." : "Saved to the talent pool.", action: { label: "Open", onClick: () => ui.openCandidate(c.id) } });
    onClose();
  };
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);
  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader icon={<UserPlus />} title="Add candidate" description="Add someone you sourced or were referred to." />
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong p-3 text-sm sm:col-span-2">
          <Upload className="size-4 text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">CV parsing will be available once the backend is connected.</span>
          <Button size="sm" variant="outline" disabled>Upload CV</Button>
        </div>
        <Field label="First name" required error={err("firstName")}><Input autoFocus value={f.firstName} onChange={set("firstName")} aria-invalid={!!err("firstName") || undefined} /></Field>
        <Field label="Last name" required error={err("lastName")}><Input value={f.lastName} onChange={set("lastName")} aria-invalid={!!err("lastName") || undefined} /></Field>
        <Field label="Email" required error={err("email")}><Input type="email" value={f.email} onChange={set("email")} aria-invalid={!!err("email") || undefined} /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Current title"><Input value={f.headline} onChange={set("headline")} placeholder="e.g. Product Designer" /></Field>
        <Field label="Current company"><Input value={f.currentCompany} onChange={set("currentCompany")} /></Field>
        <Field label="Location"><Input value={f.location} onChange={set("location")} placeholder="City, Country" /></Field>
        <Field label="Source"><Select value={f.source} onValueChange={(v) => setF((s) => ({ ...s, source: v as Source }))} options={SOURCES.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="LinkedIn profile URL" error={err("linkedinUrl")} className="sm:col-span-2"><Input value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://www.linkedin.com/in/…" aria-invalid={!!err("linkedinUrl") || undefined} /></Field>
        <Field label="Add to job" hint="Leave empty to save to the talent pool." ><JobPicker value={jobId} onChange={setJobId} openOnly placeholder="Talent pool only" /></Field>
        <Field label="Tags" hint="Comma separated"><Input value={f.tags} onChange={set("tags")} placeholder="Referral, French speaker" /></Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Add candidate</Button>
      </DialogFooter>
    </form>
  );
}
