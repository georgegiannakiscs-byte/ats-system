"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, Building2, Check, Mail, Monitor, Moon, Palette, Plug, Plus, Shield, Sun, Trash2, UserPlus, Users, Workflow, Minus, RotateCcw } from "lucide-react";
import { useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { usePageMeta } from "@/components/shell/page-meta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Switch } from "@/components/ui/controls";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { IntegrationsSettings } from "@/components/settings/integrations";
import { STAGE_TONE } from "@/lib/constants";
import type { CompanyProfile, EmailTemplate, NotificationPrefs, Role, StageConfig } from "@/lib/types";
import { cn, relativeTime, uid } from "@/lib/utils";

const SECTIONS = [
  { id: "company", label: "Company profile", icon: Building2 },
  { id: "team", label: "Team members", icon: Users },
  { id: "roles", label: "Roles & permissions", icon: Shield },
  { id: "pipeline", label: "Pipeline", icon: Workflow },
  { id: "templates", label: "Email templates", icon: Mail },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Plug },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsPage() {
  return (
    <React.Suspense>
      <Settings />
    </React.Suspense>
  );
}

function Settings() {
  const sp = useSearchParams();
  const router = useRouter();
  const section = (SECTIONS.some((s) => s.id === sp.get("section")) ? sp.get("section") : "company") as SectionId;
  const current = SECTIONS.find((s) => s.id === section)!;
  usePageMeta(current.label, [{ label: "Settings", href: "/settings" }]);
  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 md:grid-cols-[200px_1fr]">
      <nav aria-label="Settings sections" className="md:sticky md:top-16 md:self-start">
        <ul className="flex gap-1 overflow-x-auto scrollbar-none md:flex-col">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <button
                onClick={() => router.replace(`/settings?section=${s.id}`, { scroll: false })}
                aria-current={section === s.id ? "page" : undefined}
                className={cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors", section === s.id ? "bg-surface font-medium text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
              >
                <s.icon className="size-4" />{s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 animate-fade-in" key={section}>
        <header className="mb-5">
          <h2 className="text-lg font-semibold tracking-tight">{current.label}</h2>
          <p className="text-sm text-muted-foreground">{{
            company: "How your company appears to candidates and teammates.",
            team: "Invite colleagues and manage who has access.",
            roles: "What each role can see and do.",
            pipeline: "Name your stages and set target times.",
            templates: "Reusable messages with personalisation variables.",
            notifications: "Choose what you hear about, and when.",
            appearance: "Make the workspace feel like yours.",
            integrations: "Connect calendars, email and LinkedIn.",
          }[section]}</p>
        </header>
        {section === "company" && <CompanySettings />}
        {section === "team" && <TeamSettings />}
        {section === "roles" && <RolesSettings />}
        {section === "pipeline" && <PipelineSettings />}
        {section === "templates" && <TemplateSettings />}
        {section === "notifications" && <NotificationSettings />}
        {section === "appearance" && <AppearanceSettings />}
        {section === "integrations" && <IntegrationsSettings />}
      </div>
    </div>
  );
}

function Panel({ children, className, footer }: { children: React.ReactNode; className?: string; footer?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className={cn("p-5", className)}>{children}</div>
      {footer && <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3">{footer}</div>}
    </div>
  );
}

function CompanySettings() {
  const db = useDb();
  const [f, setF] = React.useState<CompanyProfile>(db.company);
  const [errors, setErrors] = React.useState<Partial<Record<keyof CompanyProfile, string>>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(db.company);
  const set = (k: keyof CompanyProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => (setF((s) => ({ ...s, [k]: e.target.value })), setErrors((x) => ({ ...x, [k]: undefined })));
  const save = () => {
    const e: typeof errors = {};
    if (f.name.trim().length < 2) e.name = "Company name is required";
    if (f.website && !/^https?:\/\//.test(f.website)) e.website = "Start with https://";
    if (f.careersUrl && !/^https?:\/\//.test(f.careersUrl)) e.careersUrl = "Start with https://";
    setErrors(e);
    if (Object.keys(e).length) return;
    api.settings.updateCompany(f);
    toast.success("Company profile saved");
  };
  return (
    <Panel className="grid gap-4 sm:grid-cols-2" footer={<><Button variant="ghost" disabled={!dirty} onClick={() => (setF(db.company), setErrors({}))}>Discard</Button><Button disabled={!dirty} onClick={save}>Save changes</Button></>}>
      <div className="flex items-center gap-4 sm:col-span-2">
        <span className="flex size-14 items-center justify-center rounded-xl bg-primary font-display text-3xl text-primary-foreground">{f.name.charAt(0) || "?"}</span>
        <div><p className="text-sm font-medium">Logo</p><p className="text-xs text-muted-foreground">Generated from your company name. Uploads arrive with the backend.</p></div>
      </div>
      <Field label="Company name" required error={errors.name}><Input value={f.name} onChange={set("name")} aria-invalid={!!errors.name || undefined} /></Field>
      <Field label="Legal name"><Input value={f.legalName} onChange={set("legalName")} /></Field>
      <Field label="Website" error={errors.website}><Input value={f.website} onChange={set("website")} aria-invalid={!!errors.website || undefined} /></Field>
      <Field label="Careers page URL" error={errors.careersUrl}><Input value={f.careersUrl} onChange={set("careersUrl")} aria-invalid={!!errors.careersUrl || undefined} /></Field>
      <Field label="Industry"><Input value={f.industry} onChange={set("industry")} /></Field>
      <Field label="Company size"><Select value={f.size} onValueChange={(v) => setF((s) => ({ ...s, size: v }))} options={["1–50 employees", "51–200 employees", "201–500 employees", "501–1,000 employees", "1,000+ employees"].map((x) => ({ value: x, label: x }))} /></Field>
      <Field label="Headquarters" className="sm:col-span-2"><Input value={f.headquarters} onChange={set("headquarters")} /></Field>
      <Field label="About" hint="Shown on your careers page and job posts." className="sm:col-span-2"><Textarea value={f.about} onChange={set("about")} className="min-h-24" /></Field>
    </Panel>
  );
}

const ROLES: Role[] = ["Admin", "Recruiter", "Hiring Manager", "Interviewer"];

function TeamSettings() {
  const db = useDb();
  const [invite, setInvite] = React.useState(false);
  const [remove, setRemove] = React.useState<string | null>(null);
  const member = db.team.find((m) => m.id === remove);
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        <p className="text-sm text-muted-foreground">{db.team.filter((m) => m.status === "active").length} active · {db.team.filter((m) => m.status === "invited").length} invited</p>
        <Button size="sm" onClick={() => setInvite(true)}><UserPlus />Invite member</Button>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-xs">
        {db.team.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={m.name} hue={m.hue} size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">{m.name}{m.id === db.currentUserId && <Badge tone="muted">You</Badge>}{m.status === "invited" && <Badge tone="warning">Invite pending</Badge>}</p>
              <p className="truncate text-xs text-muted-foreground">{m.title} · {m.email}</p>
            </div>
            <Select size="sm" className="w-40" ariaLabel={`Role for ${m.name}`} value={m.role} onValueChange={(v) => (api.team.updateRole(m.id, v as Role), toast.success(`${m.name} is now ${v}`))} options={ROLES.map((r) => ({ value: r, label: r }))} />
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} disabled={m.id === db.currentUserId} onClick={() => setRemove(m.id)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <InviteDialog open={invite} onOpenChange={setInvite} />
      <ConfirmDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title={`Remove ${member?.name}?`} description="They'll lose access to this workspace. Their past notes and scorecards are kept." confirmLabel="Remove member" destructive onConfirm={() => (api.team.remove(remove!), toast(`${member?.name} removed`))} />
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("Interviewer");
  const [submitted, setSubmitted] = React.useState(false);
  React.useEffect(() => { if (open) { setName(""); setEmail(""); setRole("Interviewer"); setSubmitted(false); } }, [open]);
  const errors = { name: name.trim().length < 2 ? "Enter their name" : undefined, email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid work email" : undefined };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form noValidate onSubmit={(e) => { e.preventDefault(); setSubmitted(true); if (errors.name || errors.email) return; api.team.invite(name.trim(), email.trim(), role); toast.success(`${name} added as invited`, { description: "Demo: no invitation email was sent." }); onOpenChange(false); }}>
          <DialogHeader icon={<UserPlus />} title="Invite member" />
          <DialogBody className="space-y-4">
            <Field label="Full name" required error={submitted ? errors.name : undefined}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-invalid={(submitted && !!errors.name) || undefined} /></Field>
            <Field label="Work email" required error={submitted ? errors.email : undefined}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={(submitted && !!errors.email) || undefined} /></Field>
            <Field label="Role"><Select value={role} onValueChange={(v) => setRole(v as Role)} options={ROLES.map((r) => ({ value: r, label: r }))} /></Field>
          </DialogBody>
          <DialogFooter hint="Invites are recorded locally only."><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">Add to team</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RolesSettings() {
  const perms: { label: string; roles: [boolean | "partial", boolean | "partial", boolean | "partial", boolean | "partial"] }[] = [
    { label: "View all jobs and candidates", roles: [true, true, "partial", "partial"] },
    { label: "Create and edit jobs", roles: [true, true, "partial", false] },
    { label: "Move candidates between stages", roles: [true, true, true, false] },
    { label: "Reject candidates and make offers", roles: [true, true, true, false] },
    { label: "Schedule interviews", roles: [true, true, true, false] },
    { label: "Submit scorecards", roles: [true, true, true, true] },
    { label: "See salary information", roles: [true, true, true, false] },
    { label: "View analytics", roles: [true, true, "partial", false] },
    { label: "Manage team, settings and integrations", roles: [true, false, false, false] },
  ];
  const cell = (v: boolean | "partial") => v === true ? <Check className="mx-auto size-4 text-success" aria-label="Allowed" /> : v === "partial" ? <span className="mx-auto block w-fit rounded bg-muted px-1.5 text-[11px] text-muted-foreground">Own jobs</span> : <Minus className="mx-auto size-4 text-subtle-foreground" aria-label="Not allowed" />;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-xs">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="border-b border-border bg-surface-2/60"><tr><th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Permission</th>{ROLES.map((r) => <th key={r} className="px-3 py-2.5 text-center text-xs font-semibold">{r}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{perms.map((p) => <tr key={p.label}><td className="px-4 py-2.5">{p.label}</td>{p.roles.map((v, i) => <td key={i} className="px-3 py-2.5 text-center">{cell(v)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Default role presets. Custom roles and enforcement arrive with authentication — this matrix documents the intended model.</p>
    </div>
  );
}

function PipelineSettings() {
  const db = useDb();
  const [stages, setStages] = React.useState<StageConfig[]>(db.stages);
  const dirty = JSON.stringify(stages) !== JSON.stringify(db.stages);
  const invalid = stages.some((s) => !s.label.trim());
  const patch = (i: number, p: Partial<StageConfig>) => setStages((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  return (
    <Panel className="p-0" footer={<><Button variant="ghost" disabled={!dirty} onClick={() => setStages(db.stages)}>Discard</Button><Button disabled={!dirty || invalid} onClick={() => (api.settings.updateStages(stages), toast.success("Pipeline updated", { description: "New names appear everywhere instantly." }))}>Save pipeline</Button></>}>
      <ol className="divide-y divide-border">
        {stages.map((s, i) => (
          <li key={s.id} className="grid items-start gap-3 px-5 py-3 sm:grid-cols-[28px_1fr_1.4fr_110px]">
            <span className="tabular mt-1.5 flex size-6 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: STAGE_TONE[s.id] }}>{i + 1}</span>
            <Field label="Stage name" error={!s.label.trim() ? "Required" : undefined}><Input value={s.label} onChange={(e) => patch(i, { label: e.target.value })} aria-invalid={!s.label.trim() || undefined} /></Field>
            <Field label="Description"><Input value={s.description} onChange={(e) => patch(i, { description: e.target.value })} /></Field>
            <Field label="Target (days)"><Input type="number" min={0} max={60} value={s.slaDays} disabled={s.id === "hired"} onChange={(e) => patch(i, { slaDays: Math.max(0, Number(e.target.value)) })} /></Field>
          </li>
        ))}
      </ol>
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">The eight core stages are fixed so analytics stay comparable. Per-job custom stages will be available with the backend.</p>
    </Panel>
  );
}

const VARIABLES = ["{{first_name}}", "{{job_title}}", "{{company}}", "{{recruiter_name}}", "{{interview_type}}", "{{scheduling_link}}"];

function TemplateSettings() {
  const db = useDb();
  const [editing, setEditing] = React.useState<EmailTemplate | null>(null);
  const [remove, setRemove] = React.useState<EmailTemplate | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setEditing({ id: uid("e"), name: "", category: "Application", subject: "", body: "", updatedAt: new Date().toISOString() })}><Plus />New template</Button></div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-xs">
        {db.emailTemplates.map((t) => (
          <li key={t.id} className="group flex items-center gap-3 px-4 py-3">
            <Mail className="size-4 text-muted-foreground" />
            <button onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium group-hover:underline">{t.name}</p>
              <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
            </button>
            <Badge tone="neutral">{t.category}</Badge>
            <span className="hidden w-24 text-right text-xs text-subtle-foreground sm:block">{relativeTime(t.updatedAt)}</span>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => setRemove(t)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <TemplateEditor template={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title={`Delete “${remove?.name}”?`} confirmLabel="Delete template" destructive onConfirm={() => (api.settings.deleteTemplate(remove!.id), toast("Template deleted"))} />
    </div>
  );
}

function TemplateEditor({ template, onClose }: { template: EmailTemplate | null; onClose: () => void }) {
  const [t, setT] = React.useState<EmailTemplate | null>(template);
  const [submitted, setSubmitted] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { setT(template); setSubmitted(false); }, [template]);
  const errors = t ? { name: !t.name.trim() ? "Name the template" : undefined, subject: !t.subject.trim() ? "Add a subject" : undefined, body: t.body.trim().length < 10 ? "Write the message" : undefined } : {};
  const insert = (v: string) => {
    if (!t) return;
    const el = bodyRef.current;
    const pos = el?.selectionStart ?? t.body.length;
    setT({ ...t, body: t.body.slice(0, pos) + v + t.body.slice(pos) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + v.length, pos + v.length); });
  };
  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        {t && (
          <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); if (Object.values(errors).some(Boolean)) return; api.settings.saveTemplate(t); toast.success("Template saved"); onClose(); }}>
            <DialogHeader icon={<Mail />} title={template?.name ? "Edit template" : "New template"} />
            <DialogBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required error={submitted ? errors.name : undefined}><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} aria-invalid={(submitted && !!errors.name) || undefined} /></Field>
              <Field label="Category"><Select value={t.category} onValueChange={(v) => setT({ ...t, category: v as EmailTemplate["category"] })} options={["Application", "Interview", "Offer", "Rejection"].map((c) => ({ value: c, label: c }))} /></Field>
              <Field label="Subject" required error={submitted ? errors.subject : undefined} className="sm:col-span-2"><Input value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} aria-invalid={(submitted && !!errors.subject) || undefined} /></Field>
              <Field label="Message" required error={submitted ? errors.body : undefined} className="sm:col-span-2"><Textarea ref={bodyRef} value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} className="min-h-48 font-mono text-[13px]" aria-invalid={(submitted && !!errors.body) || undefined} /></Field>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-xs text-muted-foreground">Insert variable</p>
                <div className="flex flex-wrap gap-1">{VARIABLES.map((v) => <button key={v} type="button" onClick={() => insert(v)} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-brand/40 hover:text-foreground">{v}</button>)}</div>
              </div>
            </DialogBody>
            <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save template</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NotificationSettings() {
  const db = useDb();
  const items: { key: keyof NotificationPrefs; label: string; description: string }[] = [
    { key: "newApplication", label: "New applications", description: "When someone applies to a job you recruit for." },
    { key: "stageChange", label: "Stage changes", description: "When candidates on your jobs move forward." },
    { key: "interviewReminder", label: "Interview reminders", description: "30 minutes before interviews you're part of." },
    { key: "scorecardDue", label: "Scorecard reminders", description: "If your feedback is still missing after 24 hours." },
    { key: "taskDue", label: "Task due dates", description: "On the morning a task is due." },
    { key: "mentions", label: "Mentions", description: "When a teammate mentions you in a note." },
    { key: "weeklyDigest", label: "Weekly digest", description: "A Monday summary of your pipeline." },
  ];
  return (
    <Panel className="p-0">
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.key}>
            <label className="flex cursor-pointer items-center gap-4 px-5 py-3.5">
              <span className="flex-1"><span className="block text-sm font-medium">{i.label}</span><span className="block text-xs text-muted-foreground">{i.description}</span></span>
              <Switch checked={db.notificationPrefs[i.key]} onCheckedChange={(v) => (api.settings.updateNotificationPrefs({ [i.key]: v }), toast.success(`${i.label} ${v ? "on" : "off"}`))} aria-label={i.label} />
            </label>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Preferences are saved. Delivery (in-app and email) starts once the notification service is connected.</p>
    </Panel>
  );
}

function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [confirm, setConfirm] = React.useState(false);
  const router = useRouter();
  const opts = [
    { id: "light", label: "Light", icon: Sun, bg: "#faf9f7", fg: "#e9e6e1", ink: "#2a2825" },
    { id: "dark", label: "Dark", icon: Moon, bg: "#161615", fg: "#2a2927", ink: "#eceae6" },
    { id: "system", label: "System", icon: Monitor, bg: "linear-gradient(90deg,#faf9f7 50%,#161615 50%)", fg: "#9a968f", ink: "#6b6862" },
  ];
  return (
    <div className="space-y-4">
      <Panel>
        <p className="mb-3 text-sm font-medium">Theme</p>
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {opts.map((o) => (
            <button key={o.id} role="radio" aria-checked={theme === o.id} onClick={() => setTheme(o.id)} className={cn("rounded-xl border p-2 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring", theme === o.id ? "border-brand ring-2 ring-brand/20" : "border-border hover:border-border-strong")}>
              <div className="h-20 rounded-lg border border-black/5 p-2" style={{ background: o.bg }}>
                <div className="h-2 w-10 rounded-full" style={{ background: o.ink, opacity: 0.8 }} />
                <div className="mt-2 h-8 rounded-md" style={{ background: o.fg, opacity: 0.7 }} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 px-1 text-sm font-medium"><o.icon className="size-3.5" />{o.label}{theme === o.id && <Check className="ml-auto size-4 text-brand" />}</p>
            </button>
          ))}
        </div>
      </Panel>
      <Panel footer={<Button variant="outline" onClick={() => setConfirm(true)}><RotateCcw />Reset demo data</Button>}>
        <p className="text-sm font-medium">Demo data</p>
        <p className="mt-1 text-sm text-muted-foreground">Everything you change is stored in this browser&apos;s local storage. Reset to restore the original dataset.</p>
      </Panel>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Reset demo data?" description="All local changes will be replaced with the original demo dataset." confirmLabel="Reset data" destructive onConfirm={() => (api.settings.resetDemo(), toast.success("Demo data restored"), router.push("/"))} />
    </div>
  );
}
