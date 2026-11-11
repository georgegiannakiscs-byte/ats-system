"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Copy, ExternalLink, Plus } from "lucide-react";
import { apiFetch, loadWorkspace, useDbOrNull, type ApiError } from "@/lib/api/store";
import { api } from "@/lib/api";
import { setOrgSlug } from "@/lib/org-path";
import { refreshMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/controls";
import { DEPARTMENTS } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlainTopBar } from "./top-bar";

const STEPS = [
  { id: "create", title: "Create workspace", optional: false },
  { id: "info", title: "Company information", optional: true },
  { id: "logo", title: "Upload logo", optional: true },
  { id: "branding", title: "Branding", optional: true },
  { id: "careers", title: "Careers page", optional: true },
  { id: "team", title: "Invite your team", optional: true },
  { id: "pipeline", title: "Recruitment pipeline", optional: true },
  { id: "job", title: "First job", optional: true },
  { id: "publish", title: "Publish", optional: true },
] as const;

export function Onboarding() {
  const sp = useSearchParams();
  const router = useRouter();
  const db = useDbOrNull();
  const [orgId, setOrgId] = React.useState<string | null>(sp.get("org"));
  const [step, setStep] = React.useState(0);
  const [jobId, setJobId] = React.useState<string | null>(null);

  // Resume onboarding for an existing company.
  React.useEffect(() => {
    if (!orgId) return;
    loadWorkspace(orgId).then((d) => {
      setOrgSlug(d.org.slug);
      if (step === 0) {
        const first = STEPS.findIndex((s, i) => i > 0 && !d.org.onboarding[s.id]);
        setStep(first === -1 ? STEPS.length - 1 : first);
      }
    }).catch(() => setOrgId(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const done = async (advance = true) => {
    if (step > 0) await api.settings.markOnboarding(STEPS[step].id).catch(() => {});
    if (advance && step < STEPS.length - 1) setStep(step + 1);
  };
  const finish = () => router.push(`/app/${db!.org.slug}/dashboard`);
  const ready = step === 0 || (db && db.org.id === orgId);

  return (
    <div className="min-h-dvh">
      <PlainTopBar />
      <main className="mx-auto grid max-w-5xl gap-8 p-4 sm:p-8 md:grid-cols-[220px_1fr]">
        <aside>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-subtle-foreground">Set-up · {Math.round((step / (STEPS.length - 1)) * 100)}%</p>
          <div className="mb-4 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-signal transition-all" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} /></div>
          <ol className="flex gap-1 overflow-x-auto md:flex-col">
            {STEPS.map((s, i) => (
              <li key={s.id} className={cn("flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm", i === step ? "bg-surface font-medium shadow-sm ring-1 ring-border" : "text-muted-foreground")}>
                <span className={cn("flex size-5 items-center justify-center rounded-full border text-[11px]", i < step || (db?.org.onboarding[s.id] && i > 0) ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-signal text-signal" : "border-border-strong")}>
                  {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="hidden md:inline">{s.title}</span>
              </li>
            ))}
          </ol>
        </aside>
        <section className="min-w-0 rounded-xl border border-border bg-surface p-6 shadow-xs">
          <header className="mb-5">
            <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}{STEPS[step].optional && " · optional"}</p>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight">{STEPS[step].title}</h1>
          </header>
          {!ready ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <>
              {step === 0 && <CreateStep onCreated={(id, slug) => { setOrgSlug(slug); setOrgId(id); setStep(1); }} />}
              {step === 1 && <InfoStep onDone={done} />}
              {step === 2 && <LogoStep onDone={done} />}
              {step === 3 && <BrandingStep onDone={done} />}
              {step === 4 && <CareersStep onDone={done} />}
              {step === 5 && <TeamStep onDone={done} />}
              {step === 6 && <PipelineStep onDone={done} />}
              {step === 7 && <JobStep onDone={(id) => { setJobId(id); done(); }} />}
              {step === 8 && <PublishStep jobId={jobId} onFinish={async () => { await done(false); finish(); }} />}
              {step > 0 && step < 8 && (
                <div className="mt-6 flex justify-between border-t border-border pt-4">
                  <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 1}>Back</Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={finish}>Finish later</Button>
                    <Button variant="outline" onClick={() => setStep(step + 1)}>Skip</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function StepActions({ busy, label = "Save and continue" }: { busy?: boolean; label?: string }) {
  return <Button type="submit" disabled={busy}>{busy ? "Saving…" : label}<ChevronRight /></Button>;
}

function CreateStep({ onCreated }: { onCreated: (id: string, slug: string) => void }) {
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <form className="space-y-4" noValidate onSubmit={async (e) => {
      e.preventDefault();
      if (name.trim().length < 2) return setError("Enter the company name");
      setBusy(true);
      try {
        const r = await apiFetch<{ id: string; slug: string }>("/api/orgs", { method: "POST", body: JSON.stringify({ name: name.trim(), industry }) });
        await refreshMe();
        toast.success(`${name} created`);
        onCreated(r.id, r.slug);
      } catch (err) { setError((err as ApiError).message); setBusy(false); }
    }}>
      <p className="text-sm text-muted-foreground">Each company is an independent workspace with its own jobs, candidates, team and careers page.</p>
      <Field label="Company name" required error={error} hint={slug ? `Careers page: /careers/${slug}` : undefined}><Input autoFocus value={name} onChange={(e) => (setName(e.target.value), setError(undefined))} aria-invalid={!!error || undefined} /></Field>
      <Field label="Industry"><Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Software, Retail, Hospitality" /></Field>
      <StepActions busy={busy} label="Create workspace" />
    </form>
  );
}

function InfoStep({ onDone }: { onDone: () => void }) {
  const db = useDbOrNull()!;
  const [f, setF] = React.useState({ website: db.company.website, headquarters: db.company.headquarters, about: db.company.about, contactEmail: db.company.contactEmail ?? "" });
  const [busy, setBusy] = React.useState(false);
  return (
    <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={async (e) => {
      e.preventDefault();
      if (f.website && !/^https?:\/\//.test(f.website)) return toast.error("Website must start with https://");
      setBusy(true);
      await api.settings.updateCompany(f).then(onDone, () => {});
      setBusy(false);
    }}>
      <Field label="Website"><Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://" /></Field>
      <Field label="Headquarters"><Input value={f.headquarters} onChange={(e) => setF({ ...f, headquarters: e.target.value })} placeholder="Athens, Greece" /></Field>
      <Field label="Contact email" className="sm:col-span-2"><Input type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></Field>
      <Field label="About the company" hint="Shown on your careers page." className="sm:col-span-2"><Textarea value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} className="min-h-24" /></Field>
      <div className="sm:col-span-2"><StepActions busy={busy} /></div>
    </form>
  );
}

function LogoStep({ onDone }: { onDone: () => void }) {
  const db = useDbOrNull()!;
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { await api.settings.uploadLogo(file); toast.success("Logo uploaded"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files[0]); }} className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {db.org.logoUrl ? <img src={db.org.logoUrl} alt="Company logo" className="max-h-28 max-w-[70%] object-contain" /> : <p className="text-sm text-muted-foreground">Drop your logo here</p>}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => upload(e.target.files?.[0])} aria-label="Logo file" />
      <p className="text-xs text-muted-foreground">PNG, JPG, WebP or SVG up to 2 MB. Transparent backgrounds look best. It appears in the company switcher, careers page and applications.</p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Uploading…" : db.org.logoUrl ? "Replace logo" : "Choose file"}</Button>
        <Button disabled={!db.org.logoUrl} onClick={onDone}>Continue<ChevronRight /></Button>
      </div>
    </div>
  );
}

function BrandingStep({ onDone }: { onDone: () => void }) {
  const db = useDbOrNull()!;
  const [primary, setPrimary] = React.useState(db.org.branding.primaryColor ?? "#193329");
  const [accent, setAccent] = React.useState(db.org.branding.accentColor ?? "#BE7157");
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (!/^#[0-9a-f]{6}$/i.test(primary) || !/^#[0-9a-f]{6}$/i.test(accent)) return toast.error("Use hex colours like #193329"); await api.settings.updateBranding({ primaryColor: primary, accentColor: accent }).then(onDone, () => {}); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Main colour"><div className="flex gap-2"><input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-8 w-10 rounded border border-input" aria-label="Main colour" /><Input value={primary} onChange={(e) => setPrimary(e.target.value)} /></div></Field>
        <Field label="Accent colour"><div className="flex gap-2"><input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-8 w-10 rounded border border-input" aria-label="Accent colour" /><Input value={accent} onChange={(e) => setAccent(e.target.value)} /></div></Field>
      </div>
      <div className="rounded-lg border border-border p-4">
        <p className="mb-3 text-xs text-muted-foreground">Preview</p>
        <button type="button" className="h-9 rounded-md px-4 text-sm font-medium text-white" style={{ background: primary }}>Apply now</button>
        <span className="ml-3 inline-block size-2 rounded-full" style={{ background: accent }} />
      </div>
      <StepActions />
    </form>
  );
}

function CareersStep({ onDone }: { onDone: () => void }) {
  const db = useDbOrNull()!;
  const b = db.org.branding;
  const [f, setF] = React.useState({ careersHeadline: b.careersHeadline ?? `Join ${db.org.name}`, careersIntro: b.careersIntro ?? "", careersLanguage: b.careersLanguage ?? "en" });
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await api.settings.updateBranding({ ...f, careersLanguage: f.careersLanguage as "en" | "el" }).then(onDone, () => {}); }}>
      <Field label="Headline"><Input value={f.careersHeadline} onChange={(e) => setF({ ...f, careersHeadline: e.target.value })} /></Field>
      <Field label="Introduction"><Textarea value={f.careersIntro} onChange={(e) => setF({ ...f, careersIntro: e.target.value })} className="min-h-20" placeholder="Why people love working here." /></Field>
      <Field label="Language"><Select value={f.careersLanguage} onValueChange={(v) => setF({ ...f, careersLanguage: v as "en" | "el" })} options={[{ value: "en", label: "English" }, { value: "el", label: "Ελληνικά" }]} /></Field>
      <p className="text-xs text-muted-foreground">Your careers page lives at /careers/{db.org.slug}</p>
      <StepActions />
    </form>
  );
}

function TeamStep({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("Recruiter");
  const [sent, setSent] = React.useState<{ email: string; link: string }[]>([]);
  const [error, setError] = React.useState<string>();
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" noValidate onSubmit={async (e) => {
        e.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email");
        try { const r = await api.team.invite(email, role); setSent((s) => [...s, { email, link: r.link }]); setEmail(""); } catch (err) { setError((err as Error).message); }
      }}>
        <Field label="Email" error={error} className="min-w-56 flex-1"><Input type="email" value={email} onChange={(e) => (setEmail(e.target.value), setError(undefined))} /></Field>
        <Field label="Role"><Select value={role} onValueChange={(v) => setRole(v as Role)} className="w-40" options={["Admin", "Recruiter", "Hiring Manager", "Interviewer"].map((r) => ({ value: r, label: r }))} /></Field>
        <Button type="submit" variant="outline"><Plus />Invite</Button>
      </form>
      {sent.length > 0 && (
        <ul className="space-y-2">
          {sent.map((s) => (
            <li key={s.link} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <span className="flex-1 truncate">{s.email}</span>
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(s.link).then(() => toast.success("Invitation link copied"))}><Copy />Copy link</Button>
            </li>
          ))}
          <p className="text-xs text-muted-foreground">Email delivery is only active when the platform has an email provider configured — share these links directly otherwise.</p>
        </ul>
      )}
      <Button onClick={onDone}>Continue<ChevronRight /></Button>
    </div>
  );
}

function PipelineStep({ onDone }: { onDone: () => void }) {
  const db = useDbOrNull()!;
  const [stages, setStages] = React.useState(db.stages);
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (stages.some((s) => !s.label.trim())) return toast.error("Every stage needs a name"); await api.settings.updateStages(stages).then(onDone, () => {}); }}>
      <p className="text-sm text-muted-foreground">Rename stages to match how you hire. You can change this any time in Settings.</p>
      <ol className="space-y-2">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3">
            <span className="tabular w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
            <Input value={s.label} onChange={(e) => setStages((ss) => ss.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Stage ${i + 1} name`} />
          </li>
        ))}
      </ol>
      <StepActions />
    </form>
  );
}

function JobStep({ onDone }: { onDone: (jobId: string) => void }) {
  const db = useDbOrNull()!;
  const [f, setF] = React.useState({ title: "", department: "", location: db.company.headquarters ?? "", summary: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  return (
    <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const errs: Record<string, string> = {};
      if (f.title.trim().length < 2) errs.title = "Enter a job title";
      setErrors(errs);
      if (Object.keys(errs).length) return;
      setBusy(true);
      try {
        const job = await api.jobs.create({ ...f, title: f.title.trim(), workplace: "Hybrid", employmentType: "Full-time", seniority: "Mid-level", status: "draft", hiringManagerId: db.currentUserId, recruiterId: db.currentUserId, openings: 1, currency: "EUR", responsibilities: "", requirements: "", skills: [], channels: { careersPage: true, linkedin: false, indeed: false } });
        onDone(job.id);
      } catch { setBusy(false); }
    }}>
      <Field label="Job title" required error={errors.title} className="sm:col-span-2"><Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-invalid={!!errors.title || undefined} /></Field>
      <Field label="Department"><Select value={f.department || undefined} placeholder="Select department" onValueChange={(v) => setF({ ...f, department: v })} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} /></Field>
      <Field label="Location"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
      <Field label="Short description" className="sm:col-span-2"><Textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} className="min-h-20" /></Field>
      <p className="text-xs text-muted-foreground sm:col-span-2">Saved as a draft. You can add salary, requirements and screening questions later.</p>
      <div className="sm:col-span-2"><StepActions busy={busy} label="Create job" /></div>
    </form>
  );
}

function PublishStep({ jobId, onFinish }: { jobId: string | null; onFinish: () => void }) {
  const db = useDbOrNull()!;
  const job = jobId ? db.jobs.find((j) => j.id === jobId) : db.jobs.find((j) => j.status === "draft");
  const [busy, setBusy] = React.useState(false);
  const published = job?.status === "published";
  const url = job?.slug ? `${location.origin}/careers/${db.org.slug}/${job.slug}` : `${location.origin}/careers/${db.org.slug}`;
  return (
    <div className="space-y-4">
      {!job ? (
        <p className="text-sm text-muted-foreground">You skipped the first job. You can publish roles from Jobs at any time.</p>
      ) : (
        <div className="rounded-lg border border-border p-4">
          <p className="font-medium">{job.title}</p>
          <p className="text-sm text-muted-foreground">{[job.department, job.location].filter(Boolean).join(" · ") || "No details yet"}</p>
          {published ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-sm text-success"><Check className="size-4" />Live on your careers page</span>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"))}><Copy />Copy link</Button>
              <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noreferrer">Open<ExternalLink /></a></Button>
            </div>
          ) : (
            <Button className="mt-3" disabled={busy} onClick={async () => { setBusy(true); await api.jobs.setStatus(job.id, "published").catch(() => {}); setBusy(false); }}>{busy ? "Publishing…" : "Publish now"}</Button>
          )}
        </div>
      )}
      <Button onClick={onFinish}>Go to dashboard<ChevronRight /></Button>
    </div>
  );
}

