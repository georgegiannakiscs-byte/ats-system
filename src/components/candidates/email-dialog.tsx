"use client";
import * as React from "react";
import { Mail, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/controls";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import type { ID } from "@/lib/types";
import { fullName, primaryApplication } from "@/lib/api/selectors";

export function EmailDialog({ candidateId, onClose }: { candidateId: ID | null; onClose: () => void }) {
  return (
    <Dialog open={!!candidateId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">{candidateId && <EmailForm candidateId={candidateId} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function EmailForm({ candidateId, onClose }: { candidateId: ID; onClose: () => void }) {
  const db = useDb();
  const c = db.candidates.find((x) => x.id === candidateId)!;
  const app = primaryApplication(db, candidateId);
  const job = app ? db.jobs.find((j) => j.id === app.jobId) : undefined;
  const me = db.team.find((m) => m.id === db.currentUserId)!;
  const fill = (s: string) =>
    s
      .replaceAll("{{first_name}}", c.firstName)
      .replaceAll("{{job_title}}", job?.title ?? "the role")
      .replaceAll("{{company}}", db.company.name)
      .replaceAll("{{recruiter_name}}", me.name)
      .replaceAll("{{interview_type}}", "first conversation")
      .replaceAll("{{scheduling_link}}", "[scheduling link]");
  const [templateId, setTemplateId] = React.useState<string>("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const connected = db.integrations.gmail === "demo_connected" || db.integrations.outlook === "demo_connected" || db.integrations.smtp === "demo_connected";

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = db.emailTemplates.find((x) => x.id === id);
    if (t) {
      setSubject(fill(t.subject));
      setBody(fill(t.body));
    }
  };
  const errors = { subject: !subject.trim() ? "Add a subject" : undefined, body: body.trim().length < 5 ? "Write a message" : undefined };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.subject || errors.body) return;
    await api.logEmailDraft(candidateId, subject);
    toast("Draft saved to activity", { description: "Demo mode: no email was sent. Connect an email service to send for real." });
    onClose();
  };

  return (
    <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader icon={<Mail />} title={`Email ${fullName(c)}`} description={c.email} />
      <DialogBody className="space-y-4">
        <div className="flex gap-2 rounded-lg border border-dashed border-border-strong bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>
            {connected ? "An email service shows a demo connection, but" : "No email service is connected, so"} messages are <strong className="font-medium text-foreground">not sent</strong>. You can compose and log a draft.{" "}
            <Link href="/settings?section=integrations" onClick={onClose} className="text-brand underline-offset-2 hover:underline">Integrations</Link>
          </span>
        </div>
        <Field label="Template">
          <Select value={templateId} onValueChange={applyTemplate} placeholder="Start from a template (optional)" options={db.emailTemplates.map((t) => ({ value: t.id, label: t.name, hint: t.category }))} />
        </Field>
        <Field label="Subject" required error={submitted ? errors.subject : undefined}>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={(submitted && !!errors.subject) || undefined} />
        </Field>
        <Field label="Message" required error={submitted ? errors.body : undefined}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-48" aria-invalid={(submitted && !!errors.body) || undefined} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Discard</Button>
        <Button type="submit">Save draft</Button>
      </DialogFooter>
    </form>
  );
}
