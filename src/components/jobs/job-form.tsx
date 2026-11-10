"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented, Select, Switch } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/overlays";
import { TeamPicker } from "@/components/common/pickers";
import { TagEditor } from "@/components/candidates/inline-edit";
import { LinkedInLogo } from "@/components/common/logos";
import { useDb } from "@/lib/api/store";
import { api, type JobInput } from "@/lib/api";
import { DEPARTMENTS, EMPLOYMENT_TYPES, SENIORITIES, WORKPLACES } from "@/lib/constants";
import type { Job, JobStatus } from "@/lib/types";
import { cn, formatSalary } from "@/lib/utils";
import { Person } from "@/components/common/person";

const STEPS = [
  { id: "basics", title: "Basics", description: "Title, team and location" },
  { id: "description", title: "Description", description: "What the role involves" },
  { id: "team", title: "Compensation & team", description: "Salary and hiring team" },
  { id: "publish", title: "Review & publish", description: "Channels and final check" },
] as const;

type Errors = Partial<Record<keyof JobInput, string>>;

function validate(f: JobInput, step: number): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (f.title.trim().length < 3) e.title = "Enter a job title (at least 3 characters)";
    if (!f.department) e.department = "Choose a department";
    if (!f.location.trim()) e.location = "Where is this role based?";
    if (!f.openings || f.openings < 1) e.openings = "At least one opening";
  }
  if (step === 1) {
    if (f.summary.trim().length < 20) e.summary = "Write a short summary (20+ characters) — candidates read this first";
  }
  if (step === 2) {
    if (f.salaryMin && f.salaryMax && f.salaryMin > f.salaryMax) e.salaryMax = "Maximum must be greater than minimum";
    if (!f.hiringManagerId) e.hiringManagerId = "Choose a hiring manager";
    if (!f.recruiterId) e.recruiterId = "Choose a recruiter";
  }
  return e;
}

export function JobForm({ job }: { job?: Job }) {
  const db = useDb();
  const router = useRouter();
  const initial = React.useMemo<JobInput>(
    () =>
      job
        ? (({ id: _i, createdAt: _c, publishedAt: _p, ...rest }) => rest)(job)
        : {
            title: "", department: "", location: "", workplace: "Hybrid", employmentType: "Full-time", seniority: "Mid-level", status: "draft",
            hiringManagerId: "", recruiterId: db.currentUserId, openings: 1, currency: "EUR", summary: "", responsibilities: "", requirements: "", skills: [],
            channels: { careersPage: true, linkedin: false, indeed: false },
          },
    [job, db.currentUserId],
  );
  const [f, setF] = React.useState<JobInput>(initial);
  const [step, setStep] = React.useState(0);
  const [visited, setVisited] = React.useState(job ? 3 : 0);
  const [errors, setErrors] = React.useState<Errors>({});
  const [leave, setLeave] = React.useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = <K extends keyof JobInput>(k: K, v: JobInput[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  React.useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  const goTo = (target: number) => {
    if (target > step) {
      for (let s = step; s < target; s++) {
        const e = validate(f, s);
        if (Object.keys(e).length) {
          setStep(s);
          setErrors(e);
          return;
        }
      }
    }
    setErrors({});
    setStep(target);
    setVisited((v) => Math.max(v, target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (status: JobStatus) => {
    for (let s = 0; s < 3; s++) {
      const e = validate(f, s);
      if (Object.keys(e).length) {
        setStep(s);
        setErrors(e);
        toast.error("Please complete the highlighted fields");
        return;
      }
    }
    const payload = { ...f, title: f.title.trim(), status };
    if (job) {
      await api.jobs.update(job.id, payload);
      toast.success(status === "published" && job.status !== "published" ? "Job published" : "Changes saved", { description: status === "published" ? "Demo: shown on the internal careers preview only." : undefined });
      router.push(`/jobs/${job.id}`);
    } else {
      const created = await api.jobs.create(payload);
      toast.success(status === "published" ? "Job published" : "Draft saved", { description: status === "published" ? "Demo: shown on the internal careers preview only." : "You can publish it whenever you're ready." });
      router.push(`/jobs/${created.id}`);
    }
  };

  const cancelHref = job ? `/jobs/${job.id}` : "/jobs";
  const err = (k: keyof JobInput) => errors[k];

  return (
    <div className="mx-auto grid max-w-5xl gap-8 p-4 sm:p-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Form steps" className="lg:sticky lg:top-20 lg:self-start">
        <ol className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col">
          {STEPS.map((s, i) => {
            const done = i < step || (i <= visited && i !== step);
            const current = i === step;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  onClick={() => goTo(i)}
                  disabled={i > visited + 1}
                  aria-current={current ? "step" : undefined}
                  className={cn("flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-50", current ? "bg-surface shadow-sm ring-1 ring-border" : "hover:bg-accent")}
                >
                  <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", current ? "border-brand bg-brand text-brand-foreground" : done ? "border-brand/40 bg-brand-soft text-brand-soft-foreground" : "border-border-strong text-muted-foreground")}>
                    {done && !current ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="hidden sm:block">
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">{s.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form onSubmit={(e) => (e.preventDefault(), step < 3 ? goTo(step + 1) : save("published"))} noValidate className="min-w-0">
        <div className="rounded-xl border border-border bg-surface shadow-xs">
          <div className="border-b border-border px-6 py-4">
            <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
            <h2 className="text-base font-semibold tracking-tight">{STEPS[step].title}</h2>
          </div>
          <div className="grid gap-5 p-6 sm:grid-cols-2 animate-fade-in" key={step}>
            {step === 0 && (
              <>
                <Field label="Job title" required error={err("title")} className="sm:col-span-2" htmlFor="title">
                  <Input id="title" autoFocus value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Senior Frontend Engineer" aria-invalid={!!err("title") || undefined} />
                </Field>
                <Field label="Department" required error={err("department")}>
                  <Select value={f.department} onValueChange={(v) => set("department", v)} placeholder="Select department" invalid={!!err("department")} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
                </Field>
                <Field label="Seniority">
                  <Select value={f.seniority} onValueChange={(v) => set("seniority", v as JobInput["seniority"])} options={SENIORITIES.map((d) => ({ value: d, label: d }))} />
                </Field>
                <Field label="Location" required error={err("location")} htmlFor="location">
                  <Input id="location" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Paris, Lisbon, Remote (EU)…" aria-invalid={!!err("location") || undefined} />
                </Field>
                <Field label="Workplace">
                  <Segmented ariaLabel="Workplace" value={f.workplace} onChange={(v) => set("workplace", v)} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={WORKPLACES.map((w) => ({ value: w, label: w }))} />
                </Field>
                <Field label="Employment type">
                  <Select value={f.employmentType} onValueChange={(v) => set("employmentType", v as JobInput["employmentType"])} options={EMPLOYMENT_TYPES.map((d) => ({ value: d, label: d }))} />
                </Field>
                <Field label="Openings" required error={err("openings")} htmlFor="openings">
                  <Input id="openings" type="number" min={1} max={50} value={f.openings || ""} onChange={(e) => set("openings", Number(e.target.value))} className="w-28" aria-invalid={!!err("openings") || undefined} />
                </Field>
              </>
            )}
            {step === 1 && (
              <>
                <Field label="Summary" required error={err("summary")} hint="Two or three sentences. Shown at the top of the job post." className="sm:col-span-2" htmlFor="summary">
                  <Textarea id="summary" autoFocus value={f.summary} onChange={(e) => set("summary", e.target.value)} className="min-h-24" aria-invalid={!!err("summary") || undefined} />
                </Field>
                <Field label="Responsibilities" hint="One per line — rendered as a list." className="sm:col-span-2" htmlFor="resp">
                  <Textarea id="resp" value={f.responsibilities} onChange={(e) => set("responsibilities", e.target.value)} className="min-h-28" placeholder={"Own complex product surfaces end to end\nMentor engineers"} />
                </Field>
                <Field label="Requirements" hint="One per line." className="sm:col-span-2" htmlFor="req">
                  <Textarea id="req" value={f.requirements} onChange={(e) => set("requirements", e.target.value)} className="min-h-28" />
                </Field>
                <Field label="Key skills" hint="Used to highlight matching candidates." className="sm:col-span-2">
                  <TagEditor tags={f.skills} onChange={(v) => set("skills", v)} suggestions={Array.from(new Set(db.jobs.flatMap((j) => j.skills)))} />
                </Field>
              </>
            )}
            {step === 2 && (
              <>
                <div className="grid grid-cols-[1fr_1fr_100px] gap-3 sm:col-span-2">
                  <Field label="Salary from" htmlFor="smin"><Input id="smin" type="number" min={0} step={1000} value={f.salaryMin ?? ""} onChange={(e) => set("salaryMin", e.target.value ? Number(e.target.value) : undefined)} placeholder="55000" /></Field>
                  <Field label="Salary to" error={err("salaryMax")} htmlFor="smax"><Input id="smax" type="number" min={0} step={1000} value={f.salaryMax ?? ""} onChange={(e) => set("salaryMax", e.target.value ? Number(e.target.value) : undefined)} placeholder="70000" aria-invalid={!!err("salaryMax") || undefined} /></Field>
                  <Field label="Currency"><Select value={f.currency} onValueChange={(v) => set("currency", v)} options={["EUR", "GBP", "CHF", "USD"].map((c) => ({ value: c, label: c }))} /></Field>
                </div>
                <p className="-mt-3 text-xs text-muted-foreground sm:col-span-2">Pay transparency: the range is shown on the job post (EU Directive 2023/970).</p>
                <Field label="Hiring manager" required error={err("hiringManagerId")}>
                  <TeamPicker value={f.hiringManagerId ? [f.hiringManagerId] : []} onChange={(v) => set("hiringManagerId", v.at(-1) ?? "")} invalid={!!err("hiringManagerId")} placeholder="Select hiring manager" />
                </Field>
                <Field label="Recruiter" required error={err("recruiterId")}>
                  <TeamPicker value={f.recruiterId ? [f.recruiterId] : []} onChange={(v) => set("recruiterId", v.at(-1) ?? "")} filter={(r) => r === "Recruiter" || r === "Admin"} invalid={!!err("recruiterId")} placeholder="Select recruiter" />
                </Field>
                <Field label="Target hire date" htmlFor="thd">
                  <Input id="thd" type="date" value={f.targetHireDate?.slice(0, 10) ?? ""} onChange={(e) => set("targetHireDate", e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
                </Field>
              </>
            )}
            {step === 3 && (
              <div className="space-y-6 sm:col-span-2">
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-subtle-foreground">Channels</h3>
                  <label className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <span className="flex-1"><span className="block text-sm font-medium">Careers page</span><span className="block text-xs text-muted-foreground">{db.company.careersUrl.replace("https://", "")}/jobs — internal preview in this demo</span></span>
                    <Switch checked={f.channels.careersPage} onCheckedChange={(v) => set("channels", { ...f.channels, careersPage: v })} aria-label="Publish to careers page" />
                  </label>
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong p-3">
                    <LinkedInLogo className="size-5" />
                    <span className="flex-1"><span className="block text-sm font-medium">LinkedIn Jobs</span><span className="block text-xs text-muted-foreground">Requires the LinkedIn integration and official API approval.</span></span>
                    <Button size="sm" variant="outline" asChild><Link href="/settings?section=integrations">Set up</Link></Button>
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle-foreground">Review</h3>
                  <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                    {[
                      ["Title", f.title || "—"],
                      ["Team", `${f.department || "—"} · ${f.seniority}`],
                      ["Location", `${f.location || "—"} · ${f.workplace} · ${f.employmentType}`],
                      ["Openings", String(f.openings)],
                      ["Salary", formatSalary(f.salaryMin, f.salaryMax, f.currency)],
                      ["Skills", f.skills.join(", ") || "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-4 px-3 py-2"><dt className="w-28 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 flex-1">{v}</dd></div>
                    ))}
                    <div className="flex gap-4 px-3 py-2"><dt className="w-28 shrink-0 text-muted-foreground">Hiring team</dt><dd className="flex flex-wrap gap-3">{f.hiringManagerId && <Person id={f.hiringManagerId} />}{f.recruiterId && <Person id={f.recruiterId} />}</dd></div>
                  </dl>
                </section>
                <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-xs text-muted-foreground"><Info className="mt-px size-3.5 shrink-0" />Publishing in this demo marks the job as live inside {db.company.name}&apos;s workspace. Nothing is posted to external job boards.</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border bg-surface-2/50 px-6 py-3">
            <Button variant="ghost" onClick={() => (dirty ? setLeave(true) : router.push(cancelHref))}>Cancel</Button>
            <div className="ml-auto flex gap-2">
              {step > 0 && <Button variant="outline" onClick={() => goTo(step - 1)}><ChevronLeft />Back</Button>}
              <Button variant="outline" onClick={() => save(job && job.status !== "draft" ? job.status : "draft")}>{job && job.status !== "draft" ? "Save changes" : "Save draft"}</Button>
              {step < 3 ? (
                <Button type="submit">Continue<ChevronRight /></Button>
              ) : (
                <Button type="submit" variant="brand">{job?.status === "published" ? "Save & keep published" : "Publish job"}</Button>
              )}
            </div>
          </div>
        </div>
      </form>
      <ConfirmDialog open={leave} onOpenChange={setLeave} title="Discard unsaved changes?" description="Your edits to this job will be lost." confirmLabel="Discard" destructive onConfirm={() => router.push(cancelHref)} />
    </div>
  );
}
