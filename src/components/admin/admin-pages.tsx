"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, CircleCheck, CircleDashed, Copy, KeyRound, Plus, Search, ShieldCheck, UserX, UserCheck } from "lucide-react";
import { apiFetch, type ApiError } from "@/lib/api/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Skeleton, Switch } from "@/components/ui/controls";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { ColumnChart } from "@/components/charts/chart-kit";
import { CompanyLogo } from "@/components/shell/company-switcher";
import { relativeTime, shortDate } from "@/lib/utils";
import { AdminHeader } from "./admin-shell";

/* eslint-disable @typescript-eslint/no-explicit-any */
function useAdmin<T = any>(url: string) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string>();
  const load = React.useCallback(() => apiFetch<T>(url).then(setData).catch((e: ApiError) => setError(e.message)), [url]);
  React.useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <div className={`rounded-xl border border-border bg-surface shadow-xs ${className}`}>{children}</div>;
const bytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const Loading = () => <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;

/* ───────────── Overview ───────────── */
export function AdminOverview() {
  const { data } = useAdmin("/api/admin/overview");
  if (!data) return <><AdminHeader title="Platform overview" /><Loading /></>;
  const m = data.metrics;
  const tiles = [
    ["Companies", m.companies, `${m.active_companies} active`], ["Users", m.users, `${m.active_users} active in 30 days`], ["Jobs", m.jobs, `${m.published_jobs} published`],
    ["Applications", m.applications, `${m.applications_7d} in the last 7 days`], ["CV storage", bytes(m.cv_bytes), `${m.cv_files} files`], ["Email issues", m.email_failed, `${m.email_unconfigured} not sent (no provider)`],
  ];
  return (
    <>
      <AdminHeader title="Platform overview" description="Aggregated metrics only — no candidate-level data is shown here." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map(([l, v, s]) => (
          <Card key={l as string} className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="tabular mt-2 text-2xl font-semibold">{v}</p><p className="mt-1 text-xs text-muted-foreground">{s}</p></Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4"><p className="mb-2 text-sm font-semibold">Company growth</p>{data.growth.length ? <ColumnChart data={data.growth} x="month" y="companies" name="New companies" height={200} /> : <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p>}</Card>
        <Card className="p-4"><p className="mb-2 text-sm font-semibold">Platform activity (14 days)</p>{data.activity.length ? <ColumnChart data={data.activity} x="day" y="events" name="Events" height={200} /> : <p className="py-10 text-center text-sm text-muted-foreground">No activity yet</p>}</Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Services</p>
          <ul className="space-y-2 text-sm">
            {Object.entries(data.services as Record<string, string>).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between"><span className="capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                {v === "configured" || v === "connected" ? <Badge tone="success"><CircleCheck />{v === "connected" ? "Connected" : "Configured"}</Badge> : v === "local_disk" ? <Badge tone="neutral">Local disk</Badge> : <Badge tone="muted"><CircleDashed />Not configured</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">AI usage: {data.ai.requests} requests. {data.ai.note}</p>
        </Card>
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Recent administrative activity</p><Link href="/admin/audit" className="text-xs text-muted-foreground hover:text-foreground">View all</Link></div>
          <ul className="space-y-2 text-sm">{data.recentAudit.map((a: any, i: number) => <li key={i} className="flex justify-between gap-3"><span className="truncate"><span className="font-mono text-xs">{a.action}</span> <span className="text-muted-foreground">{a.company ? `· ${a.company}` : ""}</span></span><span className="shrink-0 text-xs text-subtle-foreground">{relativeTime(a.created_at)}</span></li>)}</ul>
        </Card>
      </div>
    </>
  );
}

/* ───────────── Companies ───────────── */
export function AdminCompanies() {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const { data, reload } = useAdmin<{ companies: any[] }>(`/api/admin/companies?q=${encodeURIComponent(q)}${status !== "all" ? `&status=${status}` : ""}`);
  const [create, setCreate] = React.useState(false);
  return (
    <>
      <AdminHeader title="Companies" description="Every registered company workspace." action={<Button onClick={() => setCreate(true)}><Plus />Create company</Button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="relative w-full sm:w-72"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or address" className="pl-8" aria-label="Search companies" /></label>
        <Select value={status} onValueChange={setStatus} className="w-40" ariaLabel="Status" options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }]} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-left text-[11px] uppercase tracking-wider text-subtle-foreground"><tr><th className="px-4 py-2.5 font-medium">Company</th><th className="px-3 font-medium">Status</th><th className="px-3 font-medium">Admins</th><th className="px-3 text-right font-medium">Members</th><th className="px-3 text-right font-medium">Jobs</th><th className="px-3 text-right font-medium">Applications</th><th className="px-3 font-medium">Created</th></tr></thead>
          <tbody className="divide-y divide-border">
            {!data ? <tr><td colSpan={7} className="p-6"><Skeleton className="h-6" /></td></tr> : data.companies.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No companies found</td></tr> : data.companies.map((c) => (
              <tr key={c.id} className="hover:bg-accent/50">
                <td className="px-4 py-2.5"><Link href={`/admin/companies/${c.id}`} className="flex items-center gap-2.5 font-medium hover:underline"><CompanyLogo name={c.name} logoUrl={c.logoUrl} size={24} />{c.name}<span className="font-normal text-subtle-foreground">/{c.slug}</span></Link></td>
                <td className="px-3">{c.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Suspended</Badge>}</td>
                <td className="max-w-48 truncate px-3 text-xs text-muted-foreground">{c.admins || "—"}</td>
                <td className="tabular px-3 text-right">{c.members}</td><td className="tabular px-3 text-right">{c.jobs}</td><td className="tabular px-3 text-right">{c.applications}</td>
                <td className="px-3 text-xs text-muted-foreground">{shortDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <CreateCompanyDialog open={create} onOpenChange={setCreate} onCreated={reload} />
    </>
  );
}

function CreateCompanyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [f, setF] = React.useState({ name: "", slug: "", adminEmail: "" });
  const [error, setError] = React.useState<string>();
  const [invite, setInvite] = React.useState<{ link: string } | null>(null);
  React.useEffect(() => { if (open) { setF({ name: "", slug: "", adminEmail: "" }); setError(undefined); setInvite(null); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {invite ? (
          <>
            <DialogHeader icon={<Building2 />} title="Company created" description="Share this invitation with the company administrator." />
            <DialogBody><Input readOnly value={invite.link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" /></DialogBody>
            <DialogFooter><Button variant="outline" onClick={() => navigator.clipboard?.writeText(invite.link).then(() => toast.success("Copied"))}><Copy />Copy</Button><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={async (e) => {
            e.preventDefault();
            if (f.name.trim().length < 2) return setError("Enter a company name");
            try {
              const r = await apiFetch<{ invite: { link: string } | null }>("/api/admin/companies", { method: "POST", body: JSON.stringify({ name: f.name.trim(), slug: f.slug || undefined, adminEmail: f.adminEmail || undefined }) });
              toast.success(`${f.name} created`);
              onCreated();
              if (r.invite) setInvite(r.invite); else onOpenChange(false);
            } catch (err) { setError((err as ApiError).message); }
          }}>
            <DialogHeader icon={<Building2 />} title="Create company" description="You won't be added as a member — company data stays private to its team." />
            <DialogBody className="space-y-4">
              <Field label="Company name" required error={error}><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Address (slug)" hint="Optional — generated from the name."><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="acme" /></Field>
              <Field label="Administrator email" hint="Existing users are added directly; others receive an invitation."><Input type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></Field>
            </DialogBody>
            <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">Create</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdminCompany({ id }: { id: string }) {
  const { data, reload } = useAdmin<any>(`/api/admin/companies/${id}`);
  const [suspend, setSuspend] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [edit, setEdit] = React.useState<{ name: string; slug: string } | null>(null);
  if (!data) return <Loading />;
  const c = data.company;
  const patch = (body: Record<string, unknown>, msg: string) => apiFetch(`/api/admin/companies/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(() => (toast.success(msg), reload())).catch((e: ApiError) => toast.error(e.message));
  const setFeature = (key: string, enabled: boolean | null) => apiFetch("/api/admin/features", { method: "PUT", body: JSON.stringify({ key, orgId: id, enabled }) }).then(() => (toast.success("Entitlement updated"), reload())).catch((e: ApiError) => toast.error(e.message));
  return (
    <>
      <Link href="/admin/companies" className="text-sm text-muted-foreground hover:text-foreground">← Companies</Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center gap-3">
        <CompanyLogo name={c.name} logoUrl={c.logoUrl} size={44} className="rounded-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{c.name}</h1>
          <p className="text-sm text-muted-foreground">/{c.slug} · created {shortDate(c.created_at)} · {c.status === "active" ? "Active" : `Suspended — ${c.suspended_reason}`}</p>
        </div>
        <Button variant="outline" onClick={() => setEdit({ name: c.name, slug: c.slug })}>Edit</Button>
        {c.status === "active" ? <Button variant="destructive-ghost" onClick={() => setSuspend(true)}>Suspend workspace</Button> : <Button onClick={() => patch({ status: "active" }, "Company reactivated")}>Reactivate</Button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <p className="mb-3 text-sm font-semibold">Usage</p>
          <dl className="space-y-1.5 text-sm">{[["Jobs", `${data.usage.jobs} (${data.usage.published_jobs} published)`], ["Candidates", data.usage.candidates], ["Applications", data.usage.applications], ["CV storage", bytes(data.usage.cv_bytes)], ["Emails logged", data.usage.emails]].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="tabular">{v}</dd></div>)}</dl>
          <p className="mt-3 text-xs text-muted-foreground">Counts only. Candidate records are not accessible from platform administration.</p>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold">Members</p>
          <ul className="divide-y divide-border text-sm">{data.members.map((m: any) => <li key={m.id} className="flex items-center justify-between py-2"><span>{m.name} <span className="text-muted-foreground">· {m.email}</span></span><span className="flex items-center gap-2"><Badge tone={m.role === "Admin" ? "brand" : "neutral"}>{m.role}</Badge>{m.status !== "active" && <Badge tone="muted">Removed</Badge>}</span></li>)}</ul>
          {data.invitations.filter((i: any) => !i.accepted_at && !i.revoked_at).length > 0 && <p className="mt-3 text-xs text-muted-foreground">Pending invitations: {data.invitations.filter((i: any) => !i.accepted_at && !i.revoked_at).map((i: any) => i.email).join(", ")}</p>}
        </Card>
      </div>
      <Card className="mt-4 p-4">
        <p className="mb-1 text-sm font-semibold">Feature entitlements</p>
        <p className="mb-3 text-xs text-muted-foreground">Override the platform default for this company.</p>
        <ul className="divide-y divide-border">
          {data.features.map((f: any) => (
            <li key={f.key} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{f.label}<span className="ml-2 text-xs text-muted-foreground">default {f.default_enabled ? "on" : "off"}</span></span>
              <Select size="sm" className="w-40" ariaLabel={`${f.label} entitlement`} value={f.override === null ? "default" : f.override ? "on" : "off"} onValueChange={(v) => setFeature(f.key, v === "default" ? null : v === "on")} options={[{ value: "default", label: "Platform default" }, { value: "on", label: "Enabled" }, { value: "off", label: "Disabled" }]} />
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog open={suspend} onOpenChange={setSuspend} title={`Suspend ${c.name}?`} description="Members lose access and the careers page goes offline until you reactivate it. No data is deleted." confirmLabel="Suspend" destructive onConfirm={() => { if (!reason.trim()) { toast.error("Add a reason"); return; } patch({ status: "suspended", reason }, "Company suspended"); }}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (visible in the audit log)" aria-label="Suspension reason" />
      </ConfirmDialog>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent size="sm">
          {edit && (
            <form onSubmit={(e) => { e.preventDefault(); patch({ name: edit.name, slug: edit.slug }, "Company updated").then(() => setEdit(null)); }}>
              <DialogHeader title="Edit company" />
              <DialogBody className="space-y-4">
                <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
                <Field label="Address (slug)" hint="Changing it changes the careers page URL."><Input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
              </DialogBody>
              <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit">Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── Users ───────────── */
export function AdminUsers() {
  const [q, setQ] = React.useState("");
  const { data, reload } = useAdmin<{ users: any[]; invitations: any[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);
  const [confirm, setConfirm] = React.useState<any | null>(null);
  const [recovery, setRecovery] = React.useState<{ link: string; email: string } | null>(null);
  const patch = (id: string, body: Record<string, unknown>, msg: string) => apiFetch(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(() => (toast.success(msg), reload())).catch((e: ApiError) => toast.error(e.message));
  return (
    <>
      <AdminHeader title="Users" description="Accounts, company memberships and access recovery. Passwords are never visible." />
      <label className="relative mb-3 block w-full sm:w-72"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-8" aria-label="Search users" /></label>
      <Card className="divide-y divide-border">
        {!data ? <div className="p-6"><Skeleton className="h-6" /></div> : data.users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{u.name}{u.isPlatformAdmin && <Badge tone="brand"><ShieldCheck />Platform admin</Badge>}{u.status !== "active" && <Badge tone="danger">Deactivated</Badge>}</p>
              <p className="text-xs text-muted-foreground">{u.email} · joined {shortDate(u.createdAt)} · {u.lastLoginAt ? `last sign-in ${relativeTime(u.lastLoginAt)}` : "never signed in"}</p>
              {u.memberships.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{u.memberships.map((m: any) => <span key={m.orgId} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{m.company} · {m.role}{m.status !== "active" ? " (removed)" : ""}</span>)}</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => apiFetch<{ link: string; email: string }>(`/api/admin/users/${u.id}/recovery`, { method: "POST" }).then(setRecovery).catch((e: ApiError) => toast.error(e.message))}><KeyRound />Recovery link</Button>
            {u.status === "active" ? <Button size="sm" variant="destructive-ghost" onClick={() => setConfirm(u)}><UserX />Deactivate</Button> : <Button size="sm" variant="ghost" onClick={() => patch(u.id, { status: "active" }, "User reactivated")}><UserCheck />Reactivate</Button>}
          </div>
        ))}
      </Card>
      {data && data.invitations.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="mb-2 text-sm font-semibold">Pending invitations</p>
          <ul className="space-y-1 text-sm">{data.invitations.map((i: any) => <li key={i.id} className="flex justify-between"><span>{i.email} <span className="text-muted-foreground">→ {i.company} ({i.role})</span></span><span className="text-xs text-subtle-foreground">expires {relativeTime(i.expires_at)}</span></li>)}</ul>
        </Card>
      )}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={`Deactivate ${confirm?.name}?`} description="They're signed out everywhere and can't sign in until reactivated. Company data is unaffected." confirmLabel="Deactivate" destructive onConfirm={() => patch(confirm.id, { status: "deactivated" }, "User deactivated")} />
      <Dialog open={!!recovery} onOpenChange={(o) => !o && setRecovery(null)}>
        <DialogContent size="sm">
          <DialogHeader icon={<KeyRound />} title="Access recovery link" description={`Send this to ${recovery?.email} through a trusted channel. It works once and expires in 60 minutes.`} />
          <DialogBody><Input readOnly value={recovery?.link ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Recovery link" /></DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => navigator.clipboard?.writeText(recovery!.link).then(() => toast.success("Copied"))}><Copy />Copy</Button><Button onClick={() => setRecovery(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── Features ───────────── */
export function AdminFeatures() {
  const { data, reload } = useAdmin<{ flags: any[]; overrides: any[] }>("/api/admin/features");
  const set = (key: string, defaultEnabled: boolean) => apiFetch("/api/admin/features", { method: "PUT", body: JSON.stringify({ key, defaultEnabled }) }).then(() => (toast.success("Default updated"), reload())).catch((e: ApiError) => toast.error(e.message));
  return (
    <>
      <AdminHeader title="Feature management" description="Platform defaults. Override per company from the company page." />
      <Card className="divide-y divide-border">
        {!data ? <div className="p-6"><Skeleton className="h-6" /></div> : data.flags.map((f) => (
          <label key={f.key} className="flex items-center gap-4 px-4 py-3">
            <span className="flex-1"><span className="block text-sm font-medium">{f.label}</span><span className="block text-xs text-muted-foreground">{f.description}</span></span>
            <span className="text-xs text-muted-foreground">{data.overrides.filter((o) => o.feature_key === f.key).length} overrides</span>
            <Switch checked={f.default_enabled} onCheckedChange={(v) => set(f.key, v)} aria-label={`${f.label} default`} />
          </label>
        ))}
      </Card>
    </>
  );
}

/* ───────────── Integrations ───────────── */
export function AdminIntegrations() {
  const { data } = useAdmin<{ companies: any[]; platform: any[]; emailOutbox: Record<string, number> }>("/api/admin/integrations");
  return (
    <>
      <AdminHeader title="Integration health" description="Configuration status only — credentials and tokens are never displayed." />
      <Card className="divide-y divide-border">
        {!data ? <div className="p-6"><Skeleton className="h-6" /></div> : data.platform.map((p) => (
          <div key={p.provider} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="flex-1 font-medium">{p.provider}</span>
            {p.configured ? <Badge tone="success"><CircleCheck />Configured</Badge> : <><span className="text-xs text-muted-foreground">{p.action}</span><Badge tone="muted"><CircleDashed />Not configured</Badge></>}
          </div>
        ))}
      </Card>
      {data && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Email outbox</p>
            {Object.keys(data.emailOutbox).length === 0 ? <p className="text-sm text-muted-foreground">No emails yet.</p> : <ul className="space-y-1 text-sm">{Object.entries(data.emailOutbox).map(([k, v]) => <li key={k} className="flex justify-between"><span className="capitalize">{k.replace("_", " ")}</span><span className="tabular">{v}</span></li>)}</ul>}
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Company connections</p>
            {data.companies.length === 0 ? <p className="text-sm text-muted-foreground">No company has connected an integration yet.</p> : (
              <ul className="space-y-1 text-sm">{data.companies.map((c, i) => <li key={i} className="flex justify-between"><span>{c.company} · {c.provider}</span><span>{c.status}{c.last_error ? ` — ${c.last_error}` : ""}</span></li>)}</ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

/* ───────────── Audit ───────────── */
export function AdminAudit() {
  const [q, setQ] = React.useState("");
  const [scope, setScope] = React.useState("all");
  const [page, setPage] = React.useState(0);
  const { data } = useAdmin<{ entries: any[] }>(`/api/admin/audit?q=${encodeURIComponent(q)}&page=${page}${scope !== "all" ? `&scope=${scope}` : ""}`);
  return (
    <>
      <AdminHeader title="Audit log" description="Security-relevant and administrative actions across the platform." />
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="relative w-full sm:w-72"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" /><Input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Search action, user or company" className="pl-8" aria-label="Search audit log" /></label>
        <Select value={scope} onValueChange={(v) => (setScope(v), setPage(0))} className="w-40" ariaLabel="Scope" options={[{ value: "all", label: "All scopes" }, { value: "platform", label: "Platform" }, { value: "org", label: "Company" }]} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-left text-[11px] uppercase tracking-wider text-subtle-foreground"><tr><th className="px-4 py-2.5 font-medium">When</th><th className="px-3 font-medium">Action</th><th className="px-3 font-medium">Actor</th><th className="px-3 font-medium">Company</th><th className="px-3 font-medium">Details</th></tr></thead>
          <tbody className="divide-y divide-border">
            {!data ? <tr><td colSpan={5} className="p-6"><Skeleton className="h-6" /></td></tr> : data.entries.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("en-GB")}</td>
                <td className="px-3 font-mono text-xs">{e.action}</td>
                <td className="px-3 text-xs">{e.actor ?? "system"}</td>
                <td className="px-3 text-xs">{e.company ?? "—"}</td>
                <td className="max-w-72 truncate px-3 text-xs text-muted-foreground" title={JSON.stringify(e.metadata)}>{Object.keys(e.metadata ?? {}).length ? JSON.stringify(e.metadata) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button><Button size="sm" variant="outline" disabled={(data?.entries.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Older</Button></div>
    </>
  );
}

/* ───────────── Settings ───────────── */
export function AdminSettings() {
  const { data, reload } = useAdmin<{ settings: Record<string, any> }>("/api/admin/settings");
  const [draft, setDraft] = React.useState<Record<string, any> | null>(null);
  React.useEffect(() => { if (data) setDraft(structuredClone(data.settings)); }, [data]);
  if (!draft) return <Loading />;
  const save = (key: string) => apiFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify({ key, value: draft[key] }) }).then(() => (toast.success("Settings saved"), reload())).catch((e: ApiError) => toast.error(e.message, { description: (e.details as { message: string }[] | undefined)?.map((d) => d.message).join(", ") }));
  const set = (key: string, k: string, v: unknown) => setDraft({ ...draft, [key]: { ...draft[key], [k]: v } });
  return (
    <>
      <AdminHeader title="Platform settings" description="Global configuration. Secrets (SMTP, AI, OAuth) are set as server environment variables, not here." />
      <div className="space-y-4">
        <SettingsSection title="General" onSave={() => save("general")}>
          <Field label="Platform name"><Input value={draft.general.platformName} onChange={(e) => set("general", "platformName", e.target.value)} /></Field>
          <Field label="Support email"><Input value={draft.general.supportEmail} onChange={(e) => set("general", "supportEmail", e.target.value)} /></Field>
          <Field label="Default language"><Select value={draft.general.defaultLanguage} onValueChange={(v) => set("general", "defaultLanguage", v)} options={[{ value: "en", label: "English" }, { value: "el", label: "Ελληνικά" }]} /></Field>
          <Field label="Supported languages"><div className="flex h-8 items-center gap-4 text-sm">{["en", "el"].map((l) => <label key={l} className="flex items-center gap-1.5"><input type="checkbox" checked={draft.general.supportedLanguages.includes(l)} onChange={(e) => set("general", "supportedLanguages", e.target.checked ? [...draft.general.supportedLanguages, l] : draft.general.supportedLanguages.filter((x: string) => x !== l))} />{l === "en" ? "English" : "Greek"}</label>)}</div></Field>
        </SettingsSection>
        <SettingsSection title="Company creation" onSave={() => save("company_creation")}>
          <Field label="Who can create companies"><Select value={draft.company_creation.policy} onValueChange={(v) => set("company_creation", "policy", v)} options={[{ value: "any_user", label: "Any signed-in user" }, { value: "platform_admins", label: "Platform admins only" }]} /></Field>
        </SettingsSection>
        <SettingsSection title="Storage limits" onSave={() => save("storage")}>
          <Field label="Max CV size (MB)"><Input type="number" value={draft.storage.maxCvMb} onChange={(e) => set("storage", "maxCvMb", Number(e.target.value))} /></Field>
          <Field label="Max logo size (MB)"><Input type="number" value={draft.storage.maxLogoMb} onChange={(e) => set("storage", "maxLogoMb", Number(e.target.value))} /></Field>
          <Field label="Per-company quota (MB)"><Input type="number" value={draft.storage.perCompanyQuotaMb} onChange={(e) => set("storage", "perCompanyQuotaMb", Number(e.target.value))} /></Field>
        </SettingsSection>
        <SettingsSection title="Recruitment defaults" onSave={() => save("recruitment_defaults")}>
          <Field label="Default data retention (months)"><Input type="number" value={draft.recruitment_defaults.retentionMonths} onChange={(e) => set("recruitment_defaults", "retentionMonths", Number(e.target.value))} /></Field>
          <Field label="Default careers language"><Select value={draft.recruitment_defaults.careersLanguage} onValueChange={(v) => set("recruitment_defaults", "careersLanguage", v)} options={[{ value: "en", label: "English" }, { value: "el", label: "Ελληνικά" }]} /></Field>
        </SettingsSection>
        <SettingsSection title="Maintenance" onSave={() => save("maintenance")}>
          <Field label="Maintenance banner"><div className="flex h-8 items-center"><Switch checked={draft.maintenance.enabled} onCheckedChange={(v) => set("maintenance", "enabled", v)} aria-label="Maintenance mode" /></div></Field>
          <Field label="Message"><Input value={draft.maintenance.message} onChange={(e) => set("maintenance", "message", e.target.value)} /></Field>
        </SettingsSection>
      </div>
    </>
  );
}

function SettingsSection({ title, onSave, children }: { title: string; onSave: () => void; children: React.ReactNode }) {
  return (
    <Card className="p-5"><p className="mb-4 text-sm font-semibold">{title}</p><div className="grid gap-4 sm:grid-cols-2">{children}</div><div className="mt-4 flex justify-end"><Button size="sm" onClick={onSave}>Save</Button></div></Card>
  );
}
