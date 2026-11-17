"use client";
import * as React from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { apiFetch, currentOrgId, useCan, type ApiError } from "@/lib/api/store";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/controls";

type Data = { settings: { retentionMonths: number | null; policyUrl: string; contactEmail: string }; platformMonths: number; effectiveMonths: number; dueNow: number; dueWithin30Days: number };

/** Settings → Data & privacy: retention period, privacy policy link, contact for data requests. */
export function PrivacySettings() {
  const canEdit = useCan("settings.manage");
  const [data, setData] = React.useState<Data | null>(null);
  const [f, setF] = React.useState({ retentionMonths: "", policyUrl: "", contactEmail: "" });
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => apiFetch<Data>(`/api/orgs/${currentOrgId()}/privacy`).then((d) => {
    setData(d);
    setF({ retentionMonths: d.settings.retentionMonths ? String(d.settings.retentionMonths) : "", policyUrl: d.settings.policyUrl, contactEmail: d.settings.contactEmail });
  }).catch(() => {}), []);
  React.useEffect(() => { void load(); }, [load]);
  if (!data) return <Skeleton className="h-48 rounded-xl" />;
  const save = async () => {
    const months = f.retentionMonths.trim() ? Number(f.retentionMonths) : null;
    if (months !== null && !(Number.isInteger(months) && months >= 1 && months <= 120)) return toast.error("Retention must be 1–120 months, or empty for the platform default");
    setBusy(true);
    try {
      await apiFetch(`/api/orgs/${currentOrgId()}/commands`, { method: "POST", body: JSON.stringify({ type: "settings.privacy", payload: { retentionMonths: months, policyUrl: f.policyUrl.trim(), contactEmail: f.contactEmail.trim() } }) });
      toast.success("Data & privacy saved");
      await load();
    } catch (e) { toast.error((e as ApiError).message); }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>Candidates are deleted automatically, with their CVs, notes and Quick Check answers, once none of their applications is open and nothing has happened for the retention period. You can also export or delete a candidate&apos;s data on request from their profile.</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5 shadow-xs">
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Keep candidate data for (months)" hint={`Empty = platform default (${data.platformMonths} months). Counted from the candidate's last activity, once no application is open.`}>
            <Input type="number" min={1} max={120} value={f.retentionMonths} placeholder={String(data.platformMonths)} onChange={(e) => setF({ ...f, retentionMonths: e.target.value })} />
          </Field>
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">With the current setting ({data.effectiveMonths} months)</p>
            <p className="mt-1"><span className="font-semibold">{data.dueNow}</span> candidate{data.dueNow === 1 ? "" : "s"} due for deletion now</p>
            <p><span className="font-semibold">{data.dueWithin30Days}</span> within the next 30 days</p>
            <p className="mt-1 text-xs text-muted-foreground">Deletion runs automatically several times a day. Saved changes count from the next run.</p>
          </div>
          <Field label="Privacy policy link" hint="Shown to candidates on the application form. Must start with https://.">
            <Input type="url" value={f.policyUrl} onChange={(e) => setF({ ...f, policyUrl: e.target.value })} placeholder="https://www.company.com/privacy" />
          </Field>
          <Field label="Email for data requests" hint="Where candidates can ask to see, correct or delete their data.">
            <Input type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} placeholder="privacy@company.com" />
          </Field>
        </fieldset>
        {canEdit && <div className="mt-4 flex justify-end"><Button disabled={busy} onClick={save}>Save</Button></div>}
      </div>
    </div>
  );
}
