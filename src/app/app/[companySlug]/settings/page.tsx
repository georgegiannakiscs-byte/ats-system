"use client";
import { orgPath } from "@/lib/org-path";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, Building2, Check, Copy, ExternalLink, FileText, Globe, Mail, Monitor, Moon, Palette, Plug, Plus, Shield, Sparkles, Sun, Trash2, UserPlus, Users, Workflow, Minus } from "lucide-react";
import { useCan, useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { usePageMeta } from "@/components/shell/page-meta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Switch } from "@/components/ui/controls";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/overlays";
import { IntegrationsSettings } from "@/components/settings/integrations";
import { AiSettings, CvBuilderSettings } from "@/components/settings/cv-ai";
import { STAGE_TONE } from "@/lib/constants";
import type { CompanyProfile, EmailTemplate, NotificationPrefs, Role, StageConfig } from "@/lib/types";
import { cn, relativeTime, uid } from "@/lib/utils";
import { CAREERS_FONTS, DEFAULT_ACCENT, DEFAULT_PRIMARY, contrastWarnings, isHex, luminance, onColor, resolveCareersTheme, type CareersFontKey, type CornerStyle, type HeroStyle } from "@/lib/careers-theme";
import { CareersPreview } from "@/components/settings/careers-preview";

const SECTIONS = [
  { id: "company", label: "Company profile", icon: Building2 },
  { id: "branding", label: "Branding & careers", icon: Palette },
  { id: "team", label: "Team members", icon: Users },
  { id: "roles", label: "Roles & permissions", icon: Shield },
  { id: "pipeline", label: "Pipeline", icon: Workflow },
  { id: "templates", label: "Email templates", icon: Mail },
  { id: "cv-builder", label: "CV Builder", icon: FileText },
  { id: "ai", label: "AI features", icon: Sparkles },
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
  usePageMeta(current.label, [{ label: "Settings", href: orgPath("/settings") }]);
  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 md:grid-cols-[200px_1fr]">
      <nav aria-label="Settings sections" className="md:sticky md:top-16 md:self-start">
        <ul className="flex gap-1 overflow-x-auto scrollbar-none md:flex-col">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <button
                onClick={() => router.replace(orgPath(`/settings?section=${s.id}`), { scroll: false })}
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
            branding: "Logo, colours and your public careers page.",
            team: "Invite colleagues and manage who has access.",
            roles: "What each role can see and do.",
            pipeline: "Name your stages and set target times.",
            templates: "Reusable messages with personalisation variables.",
            notifications: "Choose what you hear about, and when.",
            "cv-builder": "Templates and photo handling for candidates who build their CV on your job pages.",
            ai: "Which Claude-powered helpers your company uses. People always make the decisions.",
            appearance: "Make the workspace feel like yours.",
            integrations: "Connect calendars, email and LinkedIn.",
          }[section]}</p>
        </header>
        {section === "company" && <CompanySettings />}
        {section === "branding" && <BrandingSettings />}
        {section === "team" && <TeamSettings />}
        {section === "roles" && <RolesSettings />}
        {section === "pipeline" && <PipelineSettings />}
        {section === "templates" && <TemplateSettings />}
        {section === "cv-builder" && <CvBuilderSettings />}
        {section === "ai" && <AiSettings />}
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

function ReadOnlyNotice({ permission }: { permission: string }) {
  const allowed = useCan(permission);
  if (allowed) return null;
  return <p className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">Only company admins can change these settings. You can view them.</p>;
}

function CompanySettings() {
  const db = useDb();
  const canEdit = useCan("settings.manage");
  const [f, setF] = React.useState<CompanyProfile>(db.company);
  const [errors, setErrors] = React.useState<Partial<Record<keyof CompanyProfile, string>>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(db.company);
  const set = (k: keyof CompanyProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => (setF((s) => ({ ...s, [k]: e.target.value })), setErrors((x) => ({ ...x, [k]: undefined })));
  const url = (v?: string) => !v || /^https?:\/\/\S+\.\S+/.test(v);
  const save = async () => {
    const e: typeof errors = {};
    if (f.name.trim().length < 2) e.name = "Company name is required";
    for (const k of ["website", "careersUrl", "linkedin", "twitter", "instagram"] as const) if (!url(f[k])) e[k] = "Use a full URL starting with https://";
    if (f.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail)) e.contactEmail = "Enter a valid email";
    setErrors(e);
    if (Object.keys(e).length) return;
    await api.settings.updateCompany(f);
    window.dispatchEvent(new Event("deceler:companies-changed"));
    toast.success("Company profile saved");
  };
  return (
    <>
      <ReadOnlyNotice permission="settings.manage" />
      <Panel className="grid gap-4 sm:grid-cols-2" footer={canEdit && <><Button variant="ghost" disabled={!dirty} onClick={() => (setF(db.company), setErrors({}))}>Discard</Button><Button disabled={!dirty} onClick={save}>Save changes</Button></>}>
        <fieldset disabled={!canEdit} className="contents">
          <Field label="Company name" required error={errors.name}><Input value={f.name} onChange={set("name")} aria-invalid={!!errors.name || undefined} /></Field>
          <Field label="Legal name"><Input value={f.legalName} onChange={set("legalName")} /></Field>
          <Field label="Website" error={errors.website}><Input value={f.website} onChange={set("website")} placeholder="https://" aria-invalid={!!errors.website || undefined} /></Field>
          <Field label="Industry"><Input value={f.industry} onChange={set("industry")} /></Field>
          <Field label="Company size"><Select value={f.size || undefined} placeholder="Select size" onValueChange={(v) => setF((s) => ({ ...s, size: v }))} options={["1–50 employees", "51–200 employees", "201–500 employees", "501–1,000 employees", "1,000+ employees"].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Headquarters"><Input value={f.headquarters} onChange={set("headquarters")} /></Field>
          <Field label="Contact email" error={errors.contactEmail}><Input type="email" value={f.contactEmail ?? ""} onChange={set("contactEmail")} aria-invalid={!!errors.contactEmail || undefined} /></Field>
          <Field label="Phone"><Input value={f.phone ?? ""} onChange={set("phone")} /></Field>
          <Field label="LinkedIn page" error={errors.linkedin}><Input value={f.linkedin ?? ""} onChange={set("linkedin")} placeholder="https://www.linkedin.com/company/…" aria-invalid={!!errors.linkedin || undefined} /></Field>
          <Field label="Instagram" error={errors.instagram}><Input value={f.instagram ?? ""} onChange={set("instagram")} placeholder="https://" aria-invalid={!!errors.instagram || undefined} /></Field>
          <Field label="About" hint="Shown on your careers page." className="sm:col-span-2"><Textarea value={f.about} onChange={set("about")} className="min-h-24" /></Field>
        </fieldset>
      </Panel>
    </>
  );
}

function LogoSlot({ variant }: { variant: "light" | "dark" }) {
  const db = useDb();
  const canEdit = useCan("branding.manage");
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const url = variant === "dark" ? db.org.logoDarkUrl : db.org.logoUrl;
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      await api.settings.uploadLogo(file, variant);
      toast.success(url ? "Logo replaced" : "Logo uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{variant === "dark" ? "Logo for dark backgrounds" : "Primary logo"}</p>
        {variant === "dark" && <span className="text-[11px] text-subtle-foreground">Optional</span>}
      </div>
      <div
        onDragOver={(e) => canEdit && e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (canEdit) upload(e.dataTransfer.files[0]); }}
        className={cn("flex h-28 items-center justify-center rounded-md border border-dashed border-border-strong", variant === "dark" ? "bg-[#16231d]" : "bg-[linear-gradient(45deg,#f2efe8_25%,transparent_25%,transparent_75%,#f2efe8_75%),linear-gradient(45deg,#f2efe8_25%,transparent_25%,transparent_75%,#f2efe8_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px]")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={`${db.org.name} logo`} className="max-h-20 max-w-[80%] object-contain" /> : <span className={cn("text-xs", variant === "dark" ? "text-white/60" : "text-muted-foreground")}>{canEdit ? "Drop an image here" : "No logo"}</span>}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => upload(e.target.files?.[0])} aria-label={`Upload ${variant} logo`} />
      {canEdit && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Uploading…" : url ? "Replace" : "Upload"}</Button>
          {url && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(true)}><Trash2 />Remove</Button>}
        </div>
      )}
      <p className="text-[11px] text-subtle-foreground">PNG, JPG, WebP or SVG · up to 2 MB · transparent backgrounds supported</p>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Remove this logo?" description="Your careers page and workspace will show your company initial instead." confirmLabel="Remove logo" destructive onConfirm={async () => { await api.settings.removeLogo(variant); toast("Logo removed"); }} />
    </div>
  );
}

function ColourField({ label, hint, value, onChange, optional, emptyLabel, customDefault = "#ffffff" }: { label: string; hint?: string; value: string; onChange: (v: string) => void; optional?: boolean; emptyLabel?: string; customDefault?: string }) {
  const custom = value !== "";
  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap items-center gap-2">
        {optional && (
          <Select size="sm" className="w-32" ariaLabel={`${label}: default or custom`} value={custom ? "custom" : "default"} onValueChange={(v) => onChange(v === "custom" ? customDefault : "")} options={[{ value: "default", label: emptyLabel ?? "Default" }, { value: "custom", label: "Custom" }]} />
        )}
        {custom && <>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-input bg-surface" aria-label={label} />
          <Input value={value} onChange={(e) => onChange(e.target.value)} className="w-28" aria-label={`${label} (hex)`} />
        </>}
      </div>
    </Field>
  );
}

function BrandingSettings() {
  const db = useDb();
  const canEdit = useCan("branding.manage");
  const enabled = db.org.features.custom_branding !== false;
  const b = db.org.branding;
  const [f, setF] = React.useState({
    primaryColor: b.primaryColor ?? DEFAULT_PRIMARY, accentColor: b.accentColor ?? DEFAULT_ACCENT, backgroundColor: b.backgroundColor ?? "", textColor: b.textColor ?? "",
    headingFont: b.headingFont ?? "default", bodyFont: b.bodyFont ?? "default", cornerStyle: b.cornerStyle ?? "rounded", heroStyle: b.heroStyle ?? "plain",
    careersHeadline: b.careersHeadline ?? "", careersIntro: b.careersIntro ?? "", benefits: (b.benefits ?? []).join("\n"), careersLanguage: b.careersLanguage ?? "en", careersLayout: b.careersLayout ?? "list",
  });
  const [initial, setInitial] = React.useState(() => JSON.stringify(f));
  const dirty = JSON.stringify(f) !== initial;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const careersUrl = typeof window !== "undefined" ? `${window.location.origin}/careers/${db.org.slug}` : `/careers/${db.org.slug}`;
  const theme = resolveCareersTheme(f);
  const warnings = contrastWarnings(theme);
  const benefitList = f.benefits.split("\n").map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    const badHex = [f.primaryColor, f.accentColor, f.backgroundColor, f.textColor].some((c) => c !== "" && !isHex(c)) || !f.primaryColor || !f.accentColor;
    if (badHex) return toast.error("Colours must be hex values like #193329");
    await api.settings.updateBranding({ ...f, benefits: benefitList });
    setInitial(JSON.stringify(f));
    window.dispatchEvent(new Event("deceler:companies-changed"));
    toast.success("Branding saved", { description: "Your careers page is updated." });
  };
  const fontOptions = CAREERS_FONTS.map((x) => ({ value: x.key, label: x.kind === "default" ? x.label : `${x.label} · ${x.kind === "serif" ? "serif" : "sans"}` }));
  return (
    <div className="space-y-4">
      <ReadOnlyNotice permission="branding.manage" />
      {!enabled && <p className="rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted-foreground">Custom branding isn&apos;t enabled for this company by the platform administrator. Your careers page uses the Ulysse look; your logo and texts still appear.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <LogoSlot variant="light" />
        <LogoSlot variant="dark" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <Panel className="space-y-6" footer={canEdit && <Button disabled={!dirty} onClick={save}>Save branding</Button>}>
          <fieldset disabled={!canEdit || !enabled} className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm font-semibold">Colours</legend>
            <ColourField label="Main colour" hint="Buttons, links and the header band." value={f.primaryColor} onChange={(v) => set("primaryColor", v)} />
            <ColourField label="Accent colour" hint="Small details: the line above the headline, benefit dots." value={f.accentColor} onChange={(v) => set("accentColor", v)} />
            <ColourField label="Page background" hint="Default follows the visitor's light or dark mode." value={f.backgroundColor} onChange={(v) => set("backgroundColor", v)} optional />
            {f.backgroundColor !== "" && <ColourField label="Text colour" hint="Automatic picks dark or white text for your background." value={f.textColor} onChange={(v) => set("textColor", v)} optional emptyLabel="Automatic" customDefault={onColor(f.backgroundColor)} />}
            {warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs sm:col-span-2" aria-live="polite">
                {warnings.map((w) => <li key={w.field}>{w.message}</li>)}
              </ul>
            )}
          </fieldset>
          <div className="border-t border-border" />
          <fieldset disabled={!canEdit || !enabled} className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm font-semibold">Fonts &amp; style</legend>
            <Field label="Headings font" hint="All fonts include Greek."><Select value={f.headingFont} onValueChange={(v) => set("headingFont", v as CareersFontKey)} options={fontOptions} /></Field>
            <Field label="Text font"><Select value={f.bodyFont} onValueChange={(v) => set("bodyFont", v as CareersFontKey)} options={fontOptions} /></Field>
            <Field label="Corners"><Select value={f.cornerStyle} onValueChange={(v) => set("cornerStyle", v as CornerStyle)} options={[{ value: "sharp", label: "Sharp" }, { value: "rounded", label: "Rounded" }, { value: "round", label: "Extra round" }]} /></Field>
            <Field label="Header"><Select value={f.heroStyle} onValueChange={(v) => set("heroStyle", v as HeroStyle)} options={[{ value: "plain", label: "Plain" }, { value: "band", label: "Coloured band (main colour)" }]} /></Field>
          </fieldset>
          <div className="border-t border-border" />
          <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm font-semibold">Careers page content</legend>
            <Field label="Careers page headline" className="sm:col-span-2"><Input value={f.careersHeadline} onChange={(e) => set("careersHeadline", e.target.value)} placeholder={`Join ${db.org.name}`} /></Field>
            <Field label="Introduction" className="sm:col-span-2"><Textarea value={f.careersIntro} onChange={(e) => set("careersIntro", e.target.value)} className="min-h-20" placeholder="A few words about working with you." /></Field>
            <Field label="Benefits" hint="One per line." className="sm:col-span-2"><Textarea value={f.benefits} onChange={(e) => set("benefits", e.target.value)} className="min-h-20" placeholder={"Hybrid working\nLearning budget"} /></Field>
            <Field label="Careers page language"><Select value={f.careersLanguage} onValueChange={(v) => set("careersLanguage", v as "en" | "el")} options={[{ value: "en", label: "English" }, { value: "el", label: "Ελληνικά (Greek)" }]} /></Field>
            <Field label="Job list layout"><Select value={f.careersLayout} onValueChange={(v) => set("careersLayout", v as "list" | "grid")} options={[{ value: "list", label: "List" }, { value: "grid", label: "Cards" }]} /></Field>
          </fieldset>
        </Panel>
        <div className="space-y-2 lg:sticky lg:top-4">
          <p className="text-xs font-medium text-muted-foreground">Preview{dirty ? " · not saved yet" : ""}</p>
          <CareersPreview theme={resolveCareersTheme(f, enabled)} name={db.org.name} logoUrl={theme.background && luminance(theme.background) < 0.2 && db.org.logoDarkUrl ? db.org.logoDarkUrl : db.org.logoUrl} headline={f.careersHeadline} intro={f.careersIntro} benefits={benefitList} layout={f.careersLayout} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs">
        <Globe className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">Public careers page</p><p className="truncate text-xs text-muted-foreground">{careersUrl}</p></div>
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(careersUrl).then(() => toast.success("Link copied"))}><Copy />Copy link</Button>
        <Button size="sm" asChild><a href={`/careers/${db.org.slug}`} target="_blank" rel="noreferrer">Open<ExternalLink /></a></Button>
      </div>
    </div>
  );
}

const ROLES: Role[] = ["Admin", "Recruiter", "Hiring Manager", "Interviewer"];

function TeamSettings() {
  const db = useDb();
  const canManage = useCan("team.manage");
  const [invite, setInvite] = React.useState(false);
  const [remove, setRemove] = React.useState<string | null>(null);
  const member = db.team.find((m) => m.id === remove);
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        <p className="text-sm text-muted-foreground">{db.team.length} member{db.team.length === 1 ? "" : "s"} · {db.invitations.length} pending invitation{db.invitations.length === 1 ? "" : "s"}</p>
        {canManage && <Button size="sm" onClick={() => setInvite(true)}><UserPlus />Invite member</Button>}
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-xs">
        {db.team.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={m.name} hue={m.hue} size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">{m.name}{m.id === db.currentUserId && <Badge tone="muted">You</Badge>}</p>
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
            </div>
            {canManage ? (
              <Select size="sm" className="w-40" ariaLabel={`Role for ${m.name}`} value={m.role} onValueChange={(v) => api.team.updateRole(m.id, v as Role).then(() => toast.success(`${m.name} is now ${v}`), () => {})} options={ROLES.map((r) => ({ value: r, label: r }))} />
            ) : (
              <Badge tone="neutral" size="md">{m.role}</Badge>
            )}
            {canManage && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} disabled={m.id === db.currentUserId} onClick={() => setRemove(m.id)}><Trash2 /></Button>}
          </li>
        ))}
        {db.invitations.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground"><Mail className="size-3.5" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm">{i.email}</p><p className="text-xs text-muted-foreground">Invited as {i.role} · expires {relativeTime(i.expiresAt)}</p></div>
            <Badge tone="warning">Pending</Badge>
            {canManage && <Button variant="ghost" size="sm" onClick={() => api.team.revokeInvite(i.id).then(() => toast("Invitation revoked"))}>Revoke</Button>}
          </li>
        ))}
      </ul>
      <InviteDialog open={invite} onOpenChange={setInvite} />
      <ConfirmDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title={`Remove ${member?.name}?`} description="They'll lose access to this company. Their notes and scorecards are kept." confirmLabel="Remove member" destructive onConfirm={() => api.team.remove(remove!).then(() => toast(`${member?.name} removed`), () => {})} />
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("Recruiter");
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ link: string; delivery: string } | null>(null);
  const [error, setError] = React.useState<string>();
  React.useEffect(() => { if (open) { setEmail(""); setRole("Recruiter"); setSubmitted(false); setResult(null); setError(undefined); } }, [open]);
  const emailErr = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid work email" : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {result ? (
          <>
            <DialogHeader icon={<UserPlus />} title="Invitation created" description={result.delivery === "sent" ? `We emailed ${email}.` : "Email delivery isn't configured, so share this link with them directly."} />
            <DialogBody className="space-y-2">
              <Input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" />
              <p className="text-xs text-muted-foreground">The link works once and expires in 7 days. They&apos;ll sign in or create an account with {email}.</p>
            </DialogBody>
            <DialogFooter><Button variant="outline" onClick={() => navigator.clipboard?.writeText(result.link).then(() => toast.success("Link copied"))}><Copy />Copy link</Button><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={async (e) => {
            e.preventDefault(); setSubmitted(true); if (emailErr) return;
            setBusy(true); setError(undefined);
            try { setResult(await api.team.invite(email.trim(), role)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }}>
            <DialogHeader icon={<UserPlus />} title="Invite member" description="Roles apply to this company only." />
            <DialogBody className="space-y-4">
              <Field label="Work email" required error={submitted ? emailErr ?? error : error}><Input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={(submitted && !!emailErr) || undefined} /></Field>
              <Field label="Role"><Select value={role} onValueChange={(v) => setRole(v as Role)} options={ROLES.map((r) => ({ value: r, label: r }))} /></Field>
            </DialogBody>
            <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</Button></DialogFooter>
          </form>
        )}
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
    { label: "Create, approve and assign Quick Check questions", roles: [true, true, false, false] },
    { label: "View Quick Check responses", roles: [true, true, true, false] },
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
      <p className="text-xs text-muted-foreground">Default role presets. Custom roles and enforcement arrive with authentication - this matrix documents the intended model.</p>
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
    </div>
  );
}
