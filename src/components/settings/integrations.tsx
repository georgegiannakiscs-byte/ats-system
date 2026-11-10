"use client";
import * as React from "react";
import { toast } from "sonner";
import { Check, CircleDashed, ExternalLink, FlaskConical, Hourglass, Lock, Mail, ShieldCheck, Unplug } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { GmailLogo, GoogleCalendarLogo, LinkedInLogo, OutlookLogo } from "@/components/common/logos";
import type { IntegrationId, IntegrationState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

function StateBadge({ state }: { state: IntegrationState }) {
  if (state === "demo_connected") return <Badge tone="brand" size="md"><FlaskConical />Demo connection · simulated</Badge>;
  if (state === "pending_approval") return <Badge tone="warning" size="md"><Hourglass />Approval request drafted</Badge>;
  return <Badge tone="muted" size="md"><CircleDashed />Not connected</Badge>;
}

const LINKEDIN_CAPABILITIES = [
  { label: "Import candidate profile from a LinkedIn URL", available: "Sign in with LinkedIn (OpenID Connect) — basic profile only" },
  { label: "“Apply with LinkedIn” on your careers page", available: "Requires LinkedIn Apply Connect partner approval", gated: true },
  { label: "Post jobs to LinkedIn and sync applicants", available: "Requires Job Posting API access via a LinkedIn Talent Solutions partnership", gated: true },
  { label: "Sync InMail, notes and stages with LinkedIn Recruiter", available: "Requires Recruiter System Connect (RSC) approval and a Recruiter contract", gated: true },
];

export function IntegrationsSettings() {
  const db = useDb();
  const [dialog, setDialog] = React.useState<IntegrationId | null>(null);
  const set = (id: IntegrationId, v: IntegrationState, msg: string) => {
    api.settings.setIntegration(id, v);
    toast(msg);
  };
  const li = db.integrations.linkedin;

  const others: { id: IntegrationId; name: string; logo: React.ReactNode; description: string; scopes: string[] }[] = [
    { id: "google_calendar", name: "Google Calendar", logo: <GoogleCalendarLogo className="size-8" />, description: "Check interviewer availability, send invites and add Google Meet links automatically.", scopes: ["Read free/busy", "Create events", "Generate Meet links"] },
    { id: "outlook", name: "Microsoft Outlook", logo: <OutlookLogo className="size-8" />, description: "Schedule interviews with Microsoft 365 calendars and Teams meetings; send email from Outlook.", scopes: ["Calendars.ReadWrite", "Mail.Send", "Online meetings"] },
    { id: "gmail", name: "Gmail", logo: <GmailLogo className="size-8" />, description: "Send candidate emails from your Google Workspace address and track replies on the timeline.", scopes: ["Send as you", `Read replies to ${BRAND.name} threads`] },
    { id: "smtp", name: "Custom SMTP", logo: <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface-2"><Mail className="size-4 text-muted-foreground" /></span>, description: "Use your own mail server or a transactional provider for system emails.", scopes: ["Outgoing mail only"] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border-strong bg-surface-2/60 p-3 text-sm text-muted-foreground">
        <FlaskConical className="mt-0.5 size-4 shrink-0" />
        <p>This is a frontend preview. No OAuth flows run and no external APIs are called. “Demo connection” states are simulated so you can see how each integration will look and behave.</p>
      </div>

      {/* LinkedIn — featured */}
      <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <LinkedInLogo className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">LinkedIn</h3>
              <StateBadge state={li} />
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Bring LinkedIn into your hiring workflow — import profiles, publish roles and keep Recruiter activity in sync. Most deep integrations are only available to approved LinkedIn partners.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {li === "not_connected" ? (
              <Button onClick={() => setDialog("linkedin")} className="bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90"><LinkedInLogo className="size-4 [&_rect]:fill-white [&_path]:fill-[#0A66C2]" />Connect LinkedIn</Button>
            ) : (
              <Button variant="outline" onClick={() => set("linkedin", "not_connected", "LinkedIn demo state cleared")}><Unplug />Disconnect</Button>
            )}
          </div>
        </div>
        <div className="border-t border-border bg-surface-2/40 px-5 py-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle-foreground">Capabilities</p>
          <ul className="grid gap-2 md:grid-cols-2">
            {LINKEDIN_CAPABILITIES.map((c) => (
              <li key={c.label} className="flex gap-2.5 rounded-lg border border-border bg-surface p-3">
                {c.gated ? <Lock className="mt-0.5 size-4 shrink-0 text-warning" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.available}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 text-warning" />Locked features need official API approval from LinkedIn before they can be enabled for any customer.
          </p>
        </div>
      </article>

      <div className="grid gap-3 md:grid-cols-2">
        {others.map((o) => {
          const state = db.integrations[o.id];
          return (
            <article key={o.id} className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-xs">
              <div className="flex items-start gap-3">
                {o.logo}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{o.name}</h3>
                  <div className="mt-1"><StateBadge state={state} /></div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{o.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">{o.scopes.map((s) => <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{s}</span>)}</div>
              <div className="mt-auto flex justify-end gap-2 pt-4">
                {state === "not_connected" ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog(o.id)}>Connect</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => set(o.id, "not_connected", `${o.name} demo connection removed`)}><Unplug />Disconnect</Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <ConnectDialog id={dialog} onClose={() => setDialog(null)} name={dialog === "linkedin" ? "LinkedIn" : others.find((o) => o.id === dialog)?.name ?? ""} onDemo={(id) => set(id, "demo_connected", "Demo connection enabled — nothing was connected for real")} onRequest={() => set("linkedin", "pending_approval", "Partner request drafted — not submitted to LinkedIn")} />
    </div>
  );
}

function ConnectDialog({ id, name, onClose, onDemo, onRequest }: { id: IntegrationId | null; name: string; onClose: () => void; onDemo: (id: IntegrationId) => void; onRequest: () => void }) {
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader icon={id === "linkedin" ? <LinkedInLogo className="size-4" /> : <ExternalLink />} title={`Connect ${name}`} description="What would happen in production" />
        <DialogBody className="space-y-4 text-sm">
          <ol className="space-y-2.5">
            {[
              `You'd be redirected to ${name} to sign in and approve access (OAuth 2.0).`,
              `${BRAND.name}'s backend would securely store the token — it never touches the browser.`,
              id === "linkedin" ? "Partner-only features stay locked until LinkedIn approves the integration." : "Availability, invites and emails would sync automatically.",
            ].map((s, i) => (
              <li key={i} className="flex gap-3"><span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{i + 1}</span><span className="text-foreground/85">{s}</span></li>
            ))}
          </ol>
          <div className={cn("rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs")}>
            The backend isn&apos;t built yet, so a real connection isn&apos;t possible. You can enable a clearly labelled <strong className="font-medium">demo state</strong> to preview the connected UI.
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {id === "linkedin" && <Button variant="outline" onClick={() => (onRequest(), onClose())}>Draft partner request</Button>}
          <Button onClick={() => (id && onDemo(id), onClose())}><Check />Enable demo state</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
