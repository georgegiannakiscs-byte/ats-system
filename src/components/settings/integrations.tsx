"use client";
import * as React from "react";
import { CircleDashed, CircleCheck, Hourglass, Lock, Mail, ShieldCheck, CircleAlert, ExternalLink } from "lucide-react";
import { useDb } from "@/lib/api/store";
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
  { label: "Share jobs on LinkedIn with a tracked application link", detail: "Available without API access - arrives in Phase 3 with the LinkedIn sharing tool.", gated: false },
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
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Publish roles and bring applicants into Ulysse. Deep integrations are only available to approved LinkedIn partners.</p>
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
                <p className="text-xs text-muted-foreground">Ask your Ulysse platform administrator to configure the credentials. Once they are in place, this card will offer a real “Connect” flow.</p>
              </DialogBody>
              <DialogFooter><Button onClick={() => setDetails(null)}>Got it</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
