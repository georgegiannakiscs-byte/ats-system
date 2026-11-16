"use client";
import * as React from "react";
import { CircleDashed, CircleCheck, Hourglass, Lock, Mail, ShieldCheck, CircleAlert, ExternalLink } from "lucide-react";
import { useCan, useDb } from "@/lib/api/store";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { GmailLogo, GoogleCalendarLogo, LinkedInLogo, OutlookLogo } from "@/components/common/logos";
import type { IntegrationId, IntegrationState } from "@/lib/types";

/*
 * Integration status is read from the server. Nothing here is simulated:
 * an integration only shows "Connected" when the backend has a working connection.
 */
function StateBadge({ state }: { state: IntegrationState }) {
  if (state === "connected") return <Badge tone="success" size="md"><CircleCheck />Connected</Badge>;
  if (state === "pending_approval") return <Badge tone="warning" size="md"><Hourglass />Awaiting provider approval</Badge>;
  if (state === "error") return <Badge tone="danger" size="md"><CircleAlert />Needs attention</Badge>;
  return <Badge tone="muted" size="md"><CircleDashed />Not configured</Badge>;
}

const LINKEDIN_CAPABILITIES = [
  { label: "Share jobs on LinkedIn with a tracked application link", detail: "Available now: Jobs → a published job → Share on LinkedIn or Copy link. No API access needed; applications count as source “LinkedIn”.", gated: false },
  { label: "Company Page connection (OAuth)", detail: "Requires a LinkedIn developer app with Community Management API access.", gated: true },
  { label: "Post jobs to LinkedIn and sync applicants", detail: "Requires LinkedIn Talent Solutions partner approval (Job Posting API).", gated: true },
  { label: "Recruiter System Connect", detail: "Requires RSC partner approval and a LinkedIn Recruiter contract.", gated: true },
];

const PROVIDERS: { id: IntegrationId; name: string; logo: React.ReactNode; description: string; requires: string[]; phase: string }[] = [
  { id: "google_calendar", name: "Google Calendar & Meet", logo: <GoogleCalendarLogo className="size-8" />, description: "Availability, invites and Meet links for interviews.", requires: ["Google Cloud OAuth client (GOOGLE_CLIENT_ID / SECRET)", "Google verification for calendar scopes"], phase: "Phase 2" },
  { id: "outlook", name: "Microsoft 365 & Teams", logo: <OutlookLogo className="size-8" />, description: "Outlook calendars, Teams meetings and sending email.", requires: ["Azure app registration (MICROSOFT_CLIENT_ID / SECRET)", "Admin consent in your Microsoft tenant"], phase: "Phase 2" },
  { id: "gmail", name: "Google Workspace email", logo: <GmailLogo className="size-8" />, description: "Send candidate emails from your own address.", requires: ["Google Cloud OAuth client", "Gmail API restricted-scope verification"], phase: "Phase 2" },
  { id: "smtp", name: "Transactional email (SMTP)", logo: <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface-2"><Mail className="size-4 text-muted-foreground" /></span>, description: "Application confirmations and invitations. Configured by the platform operator today.", requires: ["SMTP_URL and MAIL_FROM on the server", "A verified sending domain (SPF / DKIM)"], phase: "Available now (platform-level)" },
];

export function IntegrationsSettings() {
  const db = useDb();
  const [details, setDetails] = React.useState<(typeof PROVIDERS)[number] | "linkedin" | null>(null);
  const li = db.integrations.linkedin;
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>Integrations connect only through official APIs and are shown as connected only when a real connection exists. Credentials are stored server-side and never displayed.</p>
      </div>

      <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <LinkedInLogo className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold">LinkedIn</h3><StateBadge state={li} /></div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Share roles on LinkedIn with a tracked link today. Posting jobs and syncing applicants through LinkedIn&apos;s APIs is only available to approved LinkedIn partners.</p>
          </div>
          <Button variant="outline" onClick={() => setDetails("linkedin")}>What&apos;s required</Button>
        </div>
        <div className="border-t border-border bg-surface-2/40 px-5 py-4">
          <ul className="grid gap-2 md:grid-cols-2">
            {LINKEDIN_CAPABILITIES.map((c) => (
              <li key={c.label} className="flex gap-2.5 rounded-lg border border-border bg-surface p-3">
                {c.gated ? <Lock className="mt-0.5 size-4 shrink-0 text-warning" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />}
                <div className="min-w-0"><p className="text-sm font-medium">{c.label}</p><p className="text-xs text-muted-foreground">{c.detail}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <LinkedInJobsFeed />
      </article>

      <div className="grid gap-3 md:grid-cols-2">
        {PROVIDERS.map((o) => (
          <article key={o.id} className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="flex items-start gap-3">
              {o.logo}
              <div className="min-w-0 flex-1"><h3 className="font-semibold">{o.name}</h3><div className="mt-1"><StateBadge state={db.integrations[o.id]} /></div></div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{o.description}</p>
            <p className="mt-2 text-xs text-subtle-foreground">{o.phase}</p>
            <div className="mt-auto flex justify-end pt-4"><Button size="sm" variant="outline" onClick={() => setDetails(o)}>Set-up requirements</Button></div>
          </article>
        ))}
      </div>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent size="md">
          {details && (
            <>
              <DialogHeader icon={details === "linkedin" ? <LinkedInLogo className="size-4" /> : <ExternalLink />} title={details === "linkedin" ? "Connecting LinkedIn" : `Connecting ${details.name}`} description="What's needed before this integration can be switched on" />
              <DialogBody className="space-y-3 text-sm">
                <ul className="list-disc space-y-1.5 pl-5 text-foreground/85">
                  {(details === "linkedin" ? ["A LinkedIn developer application owned by your organisation", "Approval for the relevant LinkedIn products (Community Management, Talent Solutions, RSC)", "LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET configured on the server"] : details.requires).map((r) => <li key={r}>{r}</li>)}
                </ul>
                <p className="text-xs text-muted-foreground">{details === "linkedin" ? "These APIs are only open to companies LinkedIn approves as partners, and the connection itself isn't built in Ulysse yet. Until then, share jobs with the tracked link (Jobs → a published job → Share on LinkedIn)." : "Credentials alone don't switch it on: the connection itself isn't built in Ulysse yet. It's listed in PROGRESS.md."}</p>
              </DialogBody>
              <DialogFooter><Button onClick={() => setDetails(null)}>Got it</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Opt-in to the free LinkedIn Basic Jobs feed: published jobs are listed in LinkedIn Jobs under the company's page. */
function LinkedInJobsFeed() {
  const db = useDb();
  const canEdit = useCan("settings.manage");
  const saved = db.org.linkedinFeed;
  const [f, setF] = React.useState(saved);
  const [error, setError] = React.useState<string>();
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const short = db.jobs.filter((j) => j.status === "published" && `${j.summary} ${j.responsibilities} ${j.requirements} ${j.niceToHave ?? ""} ${j.benefits ?? ""}`.replace(/\s+/g, " ").trim().length < 100);
  const save = async () => {
    setError(undefined);
    if (f.enabled && !/^\d{1,20}$/.test(f.companyId.trim())) return setError("Add the LinkedIn Company ID (a number) first.");
    if (f.enabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.posterEmail.trim())) return setError("Add the email LinkedIn should use for these job posts.");
    try { await api.settings.updateLinkedInFeed({ ...f, companyId: f.companyId.trim(), posterEmail: f.posterEmail.trim(), country: f.country.trim().toUpperCase() || "GR" }); toast.success(f.enabled ? "Your published jobs are in the LinkedIn feed" : "LinkedIn feed off"); } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="space-y-3 border-t border-border px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">LinkedIn Jobs, free (Basic Jobs feed)</p>
        <Badge tone={saved.enabled ? "success" : "muted"}>{saved.enabled ? "On" : "Off"}</Badge>
      </div>
      <p className="max-w-3xl text-xs text-muted-foreground">Your published jobs go into Ulysse&apos;s job feed for LinkedIn. Once LinkedIn has accepted the feed (your platform administrator sends it to them), they appear for free in LinkedIn Jobs under your company page, and “Apply” brings candidates to your job page here. Applications from there count as source “LinkedIn”.</p>
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_8rem] sm:items-end">
        <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} aria-label="Include our jobs in the LinkedIn feed" />Include our jobs</label>
        <Field label="LinkedIn Company ID" hint="The number in your LinkedIn page's admin address: linkedin.com/company/12345678/admin"><Input inputMode="numeric" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })} placeholder="12345678" /></Field>
        <Field label="Poster email" hint="Required by LinkedIn to verify the employer. Not shown to candidates."><Input type="email" value={f.posterEmail} onChange={(e) => setF({ ...f, posterEmail: e.target.value })} placeholder="careers@company.com" /></Field>
        <Field label="Country" hint="2 letters"><Input value={f.country} maxLength={2} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} /></Field>
      </fieldset>
      {short.length > 0 && <p className="text-xs text-warning">Left out until their description reaches LinkedIn&apos;s minimum of 100 characters: {short.map((j) => j.title).join(", ")}.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {canEdit && <div className="flex justify-end"><Button size="sm" disabled={!dirty} onClick={save}>Save</Button></div>}
    </div>
  );
}
