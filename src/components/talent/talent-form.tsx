"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, FileText, Pencil, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { talentDict, type TalentLang } from "@/lib/i18n/talent";
import { fmtT } from "@/lib/i18n/cv-builder";
import type { CvTemplate } from "@/lib/cv/schema";
import { CvBuilder, type GeneratedCv } from "@/components/cv-builder/cv-builder";
import { cn } from "@/lib/utils";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const base = "w-full rounded-md border border-input bg-surface px-3 text-[15px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-subtle-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring aria-invalid:border-destructive";

/** Public talent-network form: name, email, role, optional company/phone, consent and a CV. */
export function TalentForm({ lang, maxMb, templates }: { lang: TalentLang; maxMb: number; templates: CvTemplate[] }) {
  const t = talentDict[lang];
  const sp = useSearchParams();
  const [v, setV] = React.useState({ fullName: "", email: "", role: "", currentCompany: "", phone: "" });
  const [consent, setConsent] = React.useState(false);
  const [mode, setMode] = React.useState<"upload" | "create">("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [builtCv, setBuiltCv] = React.useState<GeneratedCv | null>(null);
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string>();
  const [status, setStatus] = React.useState<"idle" | "sending" | "done">("idle");
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<{ reference: string; emailDelivery?: string } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const submissionKey = React.useRef("");

  const set = (k: keyof typeof v, value: string) => { setV((x) => ({ ...x, [k]: value })); setErrors((e) => ({ ...e, [k]: "" })); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (v.fullName.trim().length < 2) e.fullName = t.errName;
    if (!emailRe.test(v.email.trim())) e.email = t.errEmail;
    if (v.role.trim().length < 2) e.role = t.errRole;
    if (v.phone && !/^[+()\d\s.-]{6,}$/.test(v.phone)) e.phone = t.errPhone;
    if (mode === "create") { if (!builtCv) e.cv = t.errCv; }
    else if (!file || !/\.(pdf|docx)$/i.test(file.name)) e.cv = t.errCv;
    else if (file.size > maxMb * 1024 * 1024) e.cv = fmtT(t.errCvSize, { mb: maxMb });
    if (!consent) e.consent = t.errConsent;
    return e;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (status === "sending") return;
    const e = validate();
    setErrors(e);
    setFormError(undefined);
    if (Object.keys(e).length) { document.getElementById(`t-${Object.keys(e)[0]}`)?.focus(); return; }
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    const fd = new FormData();
    fd.append("submissionKey", submissionKey.current);
    for (const [k, val] of Object.entries(v)) if (val.trim()) fd.append(k, val.trim());
    fd.append("consent", "yes");
    fd.append("lang", lang);
    if (mode === "create" && builtCv) fd.append("generatedCvToken", builtCv.token);
    else fd.append("cv", file!);
    for (const [k, p] of [["utmSource", "utm_source"], ["utmMedium", "utm_medium"], ["utmCampaign", "utm_campaign"]]) { const q = sp.get(p); if (q) fd.append(k, q.slice(0, 80)); }
    const honeypot = (document.getElementById("t-website") as HTMLInputElement | null)?.value;
    if (honeypot) fd.append("website", honeypot);

    setStatus("sending");
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/public/talent");
    xhr.upload.onprogress = (pe) => pe.lengthComputable && setProgress(Math.round((pe.loaded / pe.total) * 100));
    xhr.onload = () => {
      let data: { reference?: string; emailDelivery?: string; error?: string; code?: string; details?: { path: string; message: string }[] } = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        setResult({ reference: data.reference ?? "", emailDelivery: data.emailDelivery });
        setStatus("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const fe: Record<string, string> = {};
      data.details?.forEach((d) => { if (d.path) fe[d.path] = d.message; });
      if (/cv/i.test(String(data.code)) || xhr.status === 413 || xhr.status === 415 || xhr.status === 410) fe.cv = data.error ?? t.errCv;
      if (data.code === "cv_draft_expired" || data.code === "cv_draft_used") setBuiltCv(null);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? undefined : data.error ?? t.errNetwork);
      setStatus("idle");
    };
    xhr.onerror = () => { setFormError(t.errNetwork); setStatus("idle"); };
    xhr.send(fd);
  };

  if (status === "done" && result)
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-sm" role="status">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h2 className="mt-3 text-lg font-semibold">{fmtT(t.successTitle, { name: v.fullName.trim().split(/\s+/)[0] })}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.successBody}</p>
        {result.emailDelivery === "sent" && <p className="mt-2 text-sm text-muted-foreground">{fmtT(t.successEmail, { email: v.email })}</p>}
        <p className="mt-4 text-xs text-muted-foreground">{t.reference}: <span className="tabular font-mono font-medium text-foreground">{result.reference}</span></p>
      </div>
    );

  const input = (k: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { required?: boolean } = {}) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}{props.required ? <span className="text-destructive" aria-hidden> *</span> : <span className="font-normal text-muted-foreground"> ({t.optional})</span>}</span>
      <input id={`t-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k] || undefined} className={cn(base, "h-11")} {...props} />
      {errors[k] && <span role="alert" className="mt-1 block text-xs text-destructive">{errors[k]}</span>}
    </label>
  );

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6" aria-labelledby="talent-form-title">
      <h2 id="talent-form-title" className="text-lg font-semibold tracking-tight">{t.formTitle}</h2>
      <div className="mt-5 space-y-4">
        {input("fullName", t.fullName, { required: true, autoComplete: "name" })}
        {input("email", t.email, { required: true, type: "email", inputMode: "email", autoComplete: "email" })}
        {input("role", t.role, { required: true, autoComplete: "organization-title", placeholder: t.rolePh })}
        {input("currentCompany", t.company, { autoComplete: "organization", placeholder: t.companyPh })}
        {input("phone", t.phone, { type: "tel", inputMode: "tel", autoComplete: "tel" })}

        <div>
          <span className="mb-1 block text-sm font-medium" id="t-cv-label">{t.cv}<span className="text-destructive" aria-hidden> *</span></span>
          <div role="tablist" aria-label={t.cv} className="mb-2 grid grid-cols-2 rounded-md border border-border p-0.5 text-sm">
            {(["upload", "create"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => (setMode(m), setErrors((x) => ({ ...x, cv: "" })))} className={cn("rounded px-2 py-1.5", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {m === "upload" ? t.uploadTab : t.createTab}
              </button>
            ))}
          </div>
          <input ref={fileRef} id="t-cv" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-labelledby="t-cv-label" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setErrors((x) => ({ ...x, cv: "" })))} />
          {mode === "upload" ? (
            file ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</span></span>
                <button type="button" onClick={() => fileRef.current?.click()} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t.replace}</button>
                <button type="button" aria-label={t.remove} onClick={() => setFile(null)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                onDragOver={(e) => (e.preventDefault(), setDragging(true))} onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); setFile(e.dataTransfer.files[0] ?? null); setErrors((x) => ({ ...x, cv: "" })); }}
                className={cn("flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring", dragging ? "border-primary bg-accent" : errors.cv ? "border-destructive" : "border-border-strong hover:border-foreground/30")}>
                <Upload className="size-5 text-muted-foreground" />
                <span className="text-sm">{t.dropCv} <span className="font-medium underline underline-offset-2">{t.browse}</span></span>
                <span className="text-xs text-muted-foreground">{fmtT(t.cvHint, { mb: maxMb })}</span>
              </button>
            )
          ) : builtCv ? (
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex items-center gap-3">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{builtCv.fileName}</span><span className="text-xs text-muted-foreground">{t.generatedCv}</span></span>
                <button type="button" aria-label={t.remove} onClick={() => setBuiltCv(null)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
              </div>
              <div className="mt-2 flex gap-3 pl-8 text-sm">
                <a href={builtCv.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Eye className="size-3.5" />{t.preview}</a>
                <button type="button" onClick={() => setBuilderOpen(true)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" />{t.edit}</button>
              </div>
            </div>
          ) : (
            <div className={cn("rounded-lg border border-dashed px-4 py-5 text-center", errors.cv ? "border-destructive" : "border-border-strong")}>
              <p className="text-sm text-muted-foreground">{t.createIntro}</p>
              <button type="button" onClick={() => setBuilderOpen(true)} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Sparkles className="size-4" />{t.openBuilder}</button>
            </div>
          )}
          {errors.cv && <span role="alert" className="mt-1 block text-xs text-destructive">{errors.cv}</span>}
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input id="t-consent" type="checkbox" checked={consent} onChange={(e) => (setConsent(e.target.checked), setErrors((x) => ({ ...x, consent: "" })))} aria-invalid={!!errors.consent || undefined} className="mt-0.5 size-4 shrink-0" />
          <span>{t.consent}<span className="text-destructive" aria-hidden> *</span></span>
        </label>
        {errors.consent && <span role="alert" className="-mt-2 block text-xs text-destructive">{errors.consent}</span>}
      </div>

      <input id="t-website" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />

      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"><ShieldCheck className="size-3.5" />{t.privacyTitle}</summary>
        <p className="mt-2 leading-relaxed">{t.privacyBody}</p>
      </details>

      {formError && <p role="alert" className="mt-4 text-sm text-destructive">{formError}</p>}
      <button type="submit" disabled={status === "sending"} className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-primary text-[15px] font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-70">
        {status === "sending" ? (progress < 100 && mode === "upload" ? `${t.uploading} ${progress}%` : t.submitting) : t.submit}
      </button>
      {status === "sending" && <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>}

      {builderOpen && (
        <CvBuilder
          lang={lang} orgSlug="talent" jobSlug="" initialName={v.fullName} initialEmail={v.email} prefill={null}
          templates={templates} defaultTemplate={templates[0]} aiSummary={false} jobSkills={[]} generateUrl="/api/public/talent/cv/generate"
          onClose={() => setBuilderOpen(false)}
          onUse={(cv, data) => {
            setBuiltCv(cv);
            setMode("create");
            setV((x) => ({ ...x, fullName: x.fullName || data.personal.fullName, email: x.email || data.personal.email, role: x.role || data.personal.headline }));
            setErrors((x) => ({ ...x, cv: "" }));
            setBuilderOpen(false);
          }}
        />
      )}
    </form>
  );
}
