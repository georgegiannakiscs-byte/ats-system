"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronDown, FileText, Upload, X, ShieldCheck } from "lucide-react";
import { careersDict, fmt, type CareersLang } from "@/lib/i18n/careers";
import { cn } from "@/lib/utils";

type Question = { id: string; label: string; type: "text" | "yesno" };
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const base = "w-full rounded-md border border-input bg-surface px-3 text-[15px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-subtle-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring aria-invalid:border-destructive";

/**
 * Minimal public application. Required: full name, email, CV. Nothing else.
 * Optional details are collapsed and only validated when filled in.
 */
export function ApplicationForm({ lang, orgSlug, jobSlug, jobTitle, companyName, logoUrl, maxMb, questions }: { lang: CareersLang; orgSlug: string; jobSlug: string; jobTitle: string; companyName: string; logoUrl: string | null; maxMb: number; questions: Question[] }) {
  const t = careersDict[lang];
  const sp = useSearchParams();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [opt, setOpt] = React.useState<Record<string, string>>({});
  const [open, setOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<"idle" | "sending" | "done">("idle");
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<{ reference: string; emailDelivery?: string } | null>(null);
  const [formError, setFormError] = React.useState<string>();
  const submissionKey = React.useRef<string>("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (fullName.trim().length < 2) e.fullName = t.errName;
    if (!emailRe.test(email.trim())) e.email = t.errEmail;
    if (!file || !/\.(pdf|docx)$/i.test(file.name)) e.cv = t.errCv;
    else if (file.size > maxMb * 1024 * 1024) e.cv = fmt(t.errCvSize, { mb: maxMb });
    for (const k of ["linkedinUrl", "portfolioUrl", "githubUrl"]) if (opt[k] && !/^https?:\/\/\S+\.\S+/i.test(opt[k])) e[k] = lang === "el" ? "Συμπληρώστε πλήρες URL (https://…)" : "Enter a full URL starting with https://";
    if (opt.phone && !/^[+()\d\s.-]{6,}$/.test(opt.phone)) e.phone = lang === "el" ? "Μη έγκυρος αριθμός" : "Enter a valid phone number";
    return e;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (status === "sending") return; // guards against double clicks
    const e = validate();
    setErrors(e);
    setFormError(undefined);
    if (Object.keys(e).length) {
      if (Object.keys(e).some((k) => !["fullName", "email", "cv"].includes(k))) setOpen(true);
      document.getElementById(`f-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    const fd = new FormData();
    fd.append("orgSlug", orgSlug);
    fd.append("jobSlug", jobSlug);
    fd.append("submissionKey", submissionKey.current);
    fd.append("fullName", fullName.trim());
    fd.append("email", email.trim());
    fd.append("cv", file!);
    fd.append("lang", lang);
    for (const [k, v] of Object.entries(opt)) if (v.trim()) fd.append(k, v.trim());
    for (const [k, p] of [["utmSource", "utm_source"], ["utmMedium", "utm_medium"], ["utmCampaign", "utm_campaign"]]) { const v = sp.get(p); if (v) fd.append(k, v.slice(0, 80)); }
    const honeypot = (document.getElementById("f-website") as HTMLInputElement | null)?.value;
    if (honeypot) fd.append("website", honeypot);

    setStatus("sending");
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/public/apply");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: { reference?: string; emailDelivery?: string; error?: string; details?: { path: string; message: string }[] } = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        setResult({ reference: data.reference ?? "", emailDelivery: data.emailDelivery });
        setStatus("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const fieldErrors: Record<string, string> = {};
        data.details?.forEach((d) => { if (d.path) fieldErrors[d.path === "fullName" ? "fullName" : d.path] = d.message; });
        if (/cv/i.test(String(data.error)) || xhr.status === 415 || xhr.status === 413) fieldErrors.cv = data.error ?? t.errCv;
        setErrors(fieldErrors);
        setFormError(Object.keys(fieldErrors).length ? undefined : data.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
      }
    };
    xhr.onerror = () => { setFormError(lang === "el" ? "Πρόβλημα σύνδεσης. Δοκιμάστε ξανά." : "Connection problem. Please try again."); setStatus("idle"); };
    xhr.send(fd);
  };

  if (status === "done" && result)
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-sm" role="status">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl && <img src={logoUrl} alt={companyName} className="mx-auto mb-4 h-10 max-w-40 object-contain" />}
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h2 className="mt-3 text-lg font-semibold">{t.successTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{fmt(t.successBody, { job: jobTitle, company: companyName })}</p>
        {result.emailDelivery === "sent" && <p className="mt-2 text-sm text-muted-foreground">{fmt(t.successEmail, { email })}</p>}
        <p className="mt-4 text-xs text-muted-foreground">{t.reference}: <span className="tabular font-mono font-medium text-foreground">{result.reference}</span></p>
      </div>
    );

  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input id={`f-${k}`} value={opt[k] ?? ""} onChange={(e) => setOpt((o) => ({ ...o, [k]: e.target.value }))} aria-invalid={!!errors[k] || undefined} className={cn(base, "h-11")} {...props} />
      {errors[k] && <span role="alert" className="mt-1 block text-xs text-destructive">{errors[k]}</span>}
    </label>
  );
  const area = (k: string, label: string) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <textarea id={`f-${k}`} value={opt[k] ?? ""} onChange={(e) => setOpt((o) => ({ ...o, [k]: e.target.value }))} rows={3} className={cn(base, "py-2")} />
    </label>
  );

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6" aria-labelledby="apply-title">
      <h2 id="apply-title" className="text-lg font-semibold tracking-tight">{t.applyFor}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.minutes}</p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.fullName} <span className="text-destructive" aria-hidden>*</span><span className="sr-only">({t.required})</span></span>
          <input id="f-fullName" autoComplete="name" required value={fullName} onChange={(e) => (setFullName(e.target.value), setErrors((x) => ({ ...x, fullName: "" })))} aria-invalid={!!errors.fullName || undefined} aria-describedby={errors.fullName ? "e-fullName" : undefined} className={cn(base, "h-11")} />
          {errors.fullName && <span id="e-fullName" role="alert" className="mt-1 block text-xs text-destructive">{errors.fullName}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.email} <span className="text-destructive" aria-hidden>*</span><span className="sr-only">({t.required})</span></span>
          <input id="f-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => (setEmail(e.target.value), setErrors((x) => ({ ...x, email: "" })))} aria-invalid={!!errors.email || undefined} aria-describedby={errors.email ? "e-email" : undefined} className={cn(base, "h-11")} />
          {errors.email && <span id="e-email" role="alert" className="mt-1 block text-xs text-destructive">{errors.email}</span>}
        </label>
        <div>
          <span className="mb-1 block text-sm font-medium" id="cv-label">{t.cv} <span className="text-destructive" aria-hidden>*</span><span className="sr-only">({t.required})</span></span>
          <input ref={fileRef} id="f-cv" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-labelledby="cv-label" aria-invalid={!!errors.cv || undefined} onChange={(e) => (setFile(e.target.files?.[0] ?? null), setErrors((x) => ({ ...x, cv: "" })))} />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</span></span>
              <button type="button" onClick={() => fileRef.current?.click()} className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{t.replace}</button>
              <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => (e.preventDefault(), setDragging(true))}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); setFile(e.dataTransfer.files[0] ?? null); setErrors((x) => ({ ...x, cv: "" })); }}
              className={cn("flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring", dragging ? "border-primary bg-accent" : errors.cv ? "border-destructive" : "border-border-strong hover:border-foreground/30")}
            >
              <Upload className="size-5 text-muted-foreground" />
              <span className="text-sm">{t.dropCv} <span className="font-medium underline underline-offset-2">{t.browse}</span></span>
              <span className="text-xs text-muted-foreground">{fmt(t.cvHint, { mb: maxMb })}</span>
            </button>
          )}
          {errors.cv && <span role="alert" className="mt-1 block text-xs text-destructive">{errors.cv}</span>}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border">
        <button type="button" aria-expanded={open} aria-controls="optional-fields" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium">
          {t.additional} <span className="font-normal text-muted-foreground">({t.optional})</span>
          <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div id="optional-fields" className="space-y-4 border-t border-border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {field("phone", t.phone, { type: "tel", autoComplete: "tel", inputMode: "tel" })}
              {field("city", t.city, { autoComplete: "address-level2" })}
              {field("country", t.country, { autoComplete: "country-name" })}
              {field("currentTitle", t.currentTitle, { autoComplete: "organization-title" })}
              {field("currentCompany", t.currentCompany, { autoComplete: "organization" })}
              {field("yearsExperience", t.years, { inputMode: "numeric" })}
            </div>
            {field("linkedinUrl", t.linkedin, { type: "url", placeholder: "https://www.linkedin.com/in/…" })}
            {field("portfolioUrl", t.portfolio, { type: "url", placeholder: "https://" })}
            {field("githubUrl", t.github, { type: "url", placeholder: "https://github.com/…" })}
            {area("summary", t.summary)}
            {field("skills", t.skillsField, { placeholder: lang === "el" ? "χωρισμένες με κόμμα" : "comma separated" })}
            {field("languages", t.languages)}
            {area("education", t.education)}
            {field("certifications", t.certifications)}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("salaryExpectations", t.salaryExp)}
              {field("availability", t.availability)}
              {field("noticePeriod", t.notice)}
            </div>
            {area("coverLetter", t.coverLetter)}
            {questions.length > 0 && (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t.questions} <span className="font-normal text-muted-foreground">({t.optional})</span></legend>
                {questions.map((q) => q.type === "yesno" ? (
                  <div key={q.id} role="radiogroup" aria-label={q.label} className="text-sm">
                    <p className="mb-1">{q.label}</p>
                    {[lang === "el" ? "Ναι" : "Yes", lang === "el" ? "Όχι" : "No"].map((v) => (
                      <label key={v} className="mr-4 inline-flex items-center gap-1.5"><input type="radio" name={`q_${q.id}`} checked={opt[`q_${q.id}`] === v} onChange={() => setOpt((o) => ({ ...o, [`q_${q.id}`]: v }))} />{v}</label>
                    ))}
                  </div>
                ) : <div key={q.id}>{area(`q_${q.id}`, q.label)}</div>)}
              </fieldset>
            )}
            {area("notes", t.notes)}
          </div>
        )}
      </div>

      {/* Honeypot for bots — hidden from people and assistive technology. */}
      <input id="f-website" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />

      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"><ShieldCheck className="size-3.5" />{t.privacyTitle}</summary>
        <p className="mt-2 leading-relaxed">{fmt(t.privacyBody, { company: companyName })}</p>
      </details>

      {formError && <p role="alert" className="mt-4 text-sm text-destructive">{formError}</p>}
      <button type="submit" disabled={status === "sending"} className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-primary text-[15px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-70">
        {status === "sending" ? (progress < 100 ? `${t.uploading} ${progress}%` : t.submitting) : t.submit}
      </button>
      {status === "sending" && <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>}
    </form>
  );
}
