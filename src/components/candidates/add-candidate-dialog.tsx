"use client";
import * as React from "react";
import { UserPlus, Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/controls";
import { JobPicker } from "@/components/common/pickers";
import { api } from "@/lib/api";
import { ApiError, loadWorkspace, currentOrgId } from "@/lib/api/store";
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
  const [f, setF] = React.useState({ fullName: "", email: "", phone: "", location: "", headline: "", currentCompany: "", linkedinUrl: "", source: "Sourced" as Source, tags: "" });
  const [jobId, setJobId] = React.useState<ID | undefined>(initialJob);
  const [file, setFile] = React.useState<File | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [duplicate, setDuplicate] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => (setF((s) => ({ ...s, [k]: e.target.value })), k === "email" && setDuplicate(null));
  const errors = {
    fullName: f.fullName.trim().length < 2 ? "Enter the candidate's name" : undefined,
    email: !emailRe.test(f.email) ? "Enter a valid email address" : undefined,
    linkedinUrl: f.linkedinUrl && !/^https?:\/\/(www\.)?linkedin\.com\//.test(f.linkedinUrl) ? "Use a linkedin.com profile URL" : undefined,
    file: file && !/\.(pdf|docx)$/i.test(file.name) ? "Use a PDF or Word (.docx) file" : undefined,
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean) || busy) return;
    setBusy(true);
    try {
      const c = await api.candidates.create({ ...f, fullName: f.fullName.trim(), linkedinUrl: f.linkedinUrl || undefined, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), skills: [] }, jobId);
      if (file) {
        try {
          await api.candidates.uploadCv(c.id, file);
        } catch (err) {
          toast.error(`Candidate added, but the CV upload failed: ${(err as Error).message}`);
        }
      } else await loadWorkspace(currentOrgId()!);
      toast.success(`${f.fullName} added`, { description: jobId ? "Added to the Applied stage." : "Saved to the talent pool.", action: { label: "Open", onClick: () => ui.openCandidate(c.id) } });
      onClose();
    } catch (err) {
      const ae = err as ApiError;
      if (ae.code === "duplicate") setDuplicate((ae.details as { candidateId: string })?.candidateId ?? "");
    } finally {
      setBusy(false);
    }
  };
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);
  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader icon={<UserPlus />} title="Add candidate" description="Only name and email are required." />
      <DialogBody className="grid gap-4 sm:grid-cols-2">
        {duplicate !== null && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm sm:col-span-2" role="alert">
            <span className="flex-1">A candidate with this email already exists in this company.</span>
            {duplicate && <Button size="sm" variant="outline" onClick={() => (onClose(), ui.openCandidate(duplicate))}>Open existing</Button>}
          </div>
        )}
        <Field label="Full name" required error={err("fullName")}><Input autoFocus value={f.fullName} onChange={set("fullName")} aria-invalid={!!err("fullName") || undefined} /></Field>
        <Field label="Email" required error={err("email")}><Input type="email" value={f.email} onChange={set("email")} aria-invalid={!!err("email") || undefined} /></Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-medium">CV <span className="font-normal text-muted-foreground">(optional)</span></p>
          <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="CV file" />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <FileText className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-xs text-muted-foreground">{Math.round(file.size / 1024)} KB</span>
              <Button size="icon-xs" variant="ghost" aria-label="Remove file" onClick={() => setFile(null)}><X /></Button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0] ?? null); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground">
              <Upload className="size-4" />Drop a PDF or DOCX, or browse
            </button>
          )}
          {err("file") && <p role="alert" className="mt-1 text-xs text-destructive">{err("file")}</p>}
        </div>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Location"><Input value={f.location} onChange={set("location")} placeholder="City, Country" /></Field>
        <Field label="Current title"><Input value={f.headline} onChange={set("headline")} /></Field>
        <Field label="Current company"><Input value={f.currentCompany} onChange={set("currentCompany")} /></Field>
        <Field label="LinkedIn profile URL" error={err("linkedinUrl")}><Input value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://www.linkedin.com/in/…" aria-invalid={!!err("linkedinUrl") || undefined} /></Field>
        <Field label="Source"><Select value={f.source} onValueChange={(v) => setF((s) => ({ ...s, source: v as Source }))} options={SOURCES.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Add to job" hint="Leave empty to save to the talent pool."><JobPicker value={jobId} onChange={setJobId} openOnly placeholder="Talent pool only" /></Field>
        <Field label="Tags" hint="Comma separated"><Input value={f.tags} onChange={set("tags")} /></Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add candidate"}</Button>
      </DialogFooter>
    </form>
  );
}
