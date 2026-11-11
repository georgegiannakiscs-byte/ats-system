"use client";
import * as React from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, Check, Download, Eye, FileText, GripVertical, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { CvDataSchema, emptyCv, type CvData, type CvLang, type CvTemplate } from "@/lib/cv/schema";
import { builderDict } from "@/lib/i18n/cv-builder";
import { cn } from "@/lib/utils";
import { CvPreview } from "./cv-preview";
import { PhotoCropper } from "./photo-cropper";

export interface GeneratedCv { token: string; fileName: string; sizeBytes: number; previewUrl: string; template: CvTemplate }

const inputCls = "w-full rounded-md border border-input bg-surface px-3 text-[15px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-subtle-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring aria-invalid:border-destructive";
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const urlOk = (v: string) => !v || /^https?:\/\/\S+\.\S+/i.test(v);
const rid = () => Math.random().toString(36).slice(2, 10);
const STEPS = ["personal", "photo", "summary", "experience", "education", "skills", "more", "finish"] as const;
type Step = (typeof STEPS)[number];
const COMMON_SKILLS = ["Communication", "Teamwork", "Problem solving", "Customer service", "Project management", "Microsoft Excel", "Google Workspace", "SQL", "Python", "JavaScript", "TypeScript", "React", "Data analysis", "Power BI", "Tableau", "Salesforce", "HubSpot", "SEO", "Google Analytics", "Figma", "Adobe Photoshop", "Accounting", "Sales", "Negotiation", "Leadership", "Scheduling", "Inventory management", "Logistics", "Recruiting", "Copywriting"];

function Text({ label, value, onChange, error, required, className, ...rest }: { label: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = React.useId();
  return (
    <label className={cn("block", className)} htmlFor={id}>
      <span className="mb-1 block text-sm font-medium">{label}{required && <span className="text-destructive" aria-hidden> *</span>}</span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || undefined} aria-required={required || undefined} className={cn(inputCls, "h-10")} {...rest} />
      {error && <span role="alert" className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}
function Area({ label, value, onChange, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const id = React.useId();
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <textarea id={id} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "py-2 leading-relaxed")} />
    </label>
  );
}

function SortableCard({ id, children, handleLabel, onRemove, removeLabel }: { id: string; children: React.ReactNode; handleLabel: string; onRemove: () => void; removeLabel: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-lg border border-border bg-surface p-4", isDragging && "relative z-10 shadow-lg")}>
      <div className="-mt-1 mb-2 flex items-center justify-between">
        <button type="button" className="-ml-1 inline-flex cursor-grab items-center gap-1 rounded p-1 text-xs text-muted-foreground hover:bg-accent active:cursor-grabbing" aria-label={handleLabel} {...attributes} {...listeners}><GripVertical className="size-4" /></button>
        <button type="button" onClick={onRemove} aria-label={removeLabel} className="rounded p-1 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"><Trash2 className="size-4" /></button>
      </div>
      {children}
    </div>
  );
}

function SortableList<T extends { id: string }>({ items, onChange, render, labels }: { items: T[]; onChange: (items: T[]) => void; render: (item: T, update: (patch: Partial<T>) => void) => React.ReactNode; labels: { reorder: string; delete: string } }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    onChange(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items.map((item) => (
            <SortableCard key={item.id} id={item.id} handleLabel={labels.reorder} removeLabel={labels.delete} onRemove={() => onChange(items.filter((x) => x.id !== item.id))}>
              {render(item, (patch) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...patch } : x))))}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function TagInput({ value, onChange, placeholder, suggestions, suggestionsLabel, label }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions: string[]; suggestionsLabel: string; label: string }) {
  const [q, setQ] = React.useState("");
  const add = (s: string) => {
    const v = s.trim().replace(/,$/, "");
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase()) && value.length < 60) onChange([...value, v.slice(0, 60)]);
    setQ("");
  };
  const matches = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()) && (!q || s.toLowerCase().includes(q.toLowerCase()))).slice(0, 10);
  return (
    <div>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-surface p-1.5 focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-ring">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-sm">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
          </span>
        ))}
        <input
          aria-label={label}
          value={q}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setQ(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(q); } else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1)); }}
          placeholder={value.length ? "" : placeholder}
          className="min-w-32 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-subtle-foreground"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-2">
          <span className="text-xs text-muted-foreground">{suggestionsLabel}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">{matches.map((s) => <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-accent">+ {s}</button>)}</div>
        </div>
      )}
    </div>
  );
}

/** Merges extracted/prefill data into a valid CV (ids added, unknown fields dropped). */
export function cvFromPrefill(base: CvData, p: Record<string, unknown> | null | undefined): CvData {
  if (!p) return base;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    ...base,
    personal: {
      ...base.personal,
      fullName: base.personal.fullName || s(p.fullName), email: base.personal.email || s(p.email), phone: s(p.phone) || base.personal.phone, location: s(p.location) || base.personal.location,
      linkedinUrl: urlOk(s(p.linkedinUrl)) ? s(p.linkedinUrl) : "", portfolioUrl: urlOk(s(p.portfolioUrl)) ? s(p.portfolioUrl) : "", headline: s(p.headline) || base.personal.headline,
    },
    summary: s(p.summary) || base.summary,
    experience: arr(p.experience).slice(0, 20).map((e) => ({ id: rid(), title: s(e.title), company: s(e.company), start: s(e.start), end: s(e.end), current: Boolean(e.current), description: s(e.description), responsibilities: "", achievements: "" })),
    education: arr(p.education).slice(0, 15).map((e) => ({ id: rid(), institution: s(e.institution), degree: s(e.degree), field: s(e.field), start: s(e.start), end: s(e.end), description: "" })),
    skills: (Array.isArray(p.skills) ? (p.skills as unknown[]).map(s).filter(Boolean) : base.skills).slice(0, 60),
    languages: arr(p.languages).slice(0, 15).map((l) => ({ id: rid(), language: s(l.language), level: s(l.level) })),
    certifications: arr(p.certifications).slice(0, 20).map((c) => ({ id: rid(), name: s(c.name), issuer: s(c.issuer), date: s(c.date), url: "" })),
  };
}

export function CvBuilder({
  lang, orgSlug, jobSlug, initialName, initialEmail, prefill, templates, defaultTemplate, aiSummary, jobSkills, onClose, onUse, generateUrl = "/api/public/cv/generate",
}: {
  lang: CvLang; orgSlug: string; jobSlug: string; initialName: string; initialEmail: string; prefill?: Record<string, unknown> | null;
  templates: CvTemplate[]; defaultTemplate: CvTemplate; aiSummary: boolean; jobSkills: string[];
  onClose: () => void; onUse: (cv: GeneratedCv, data: CvData) => void;
  /** Where the PDF is generated (the /talent page uses its own endpoint). */
  generateUrl?: string;
}) {
  const t = builderDict[lang];
  const storeKey = `deceler-cv:${orgSlug}`;
  const [data, setData] = React.useState<CvData>(() => {
    let saved: { data?: CvData; template?: CvTemplate; photo?: string | null } = {};
    try { saved = JSON.parse(localStorage.getItem(storeKey) ?? "{}"); } catch {}
    const parsed = saved.data ? CvDataSchema.safeParse(saved.data) : null;
    let d = parsed?.success && !prefill ? parsed.data : emptyCv();
    d = cvFromPrefill(d, prefill);
    // Reuse what the candidate already typed in the application form.
    return { ...d, personal: { ...d.personal, fullName: initialName.trim() || d.personal.fullName, email: initialEmail.trim() || d.personal.email } };
  });
  const [template, setTemplate] = React.useState<CvTemplate>(() => {
    try { const s = JSON.parse(localStorage.getItem(storeKey) ?? "{}").template; if (templates.includes(s)) return s; } catch {}
    return templates.includes(defaultTemplate) ? defaultTemplate : templates[0];
  });
  const [cvLang, setCvLang] = React.useState<CvLang>(lang);
  const [photo, setPhoto] = React.useState<string | null>(() => { try { return JSON.parse(localStorage.getItem(storeKey) ?? "{}").photo ?? null; } catch { return null; } });
  const [step, setStep] = React.useState<Step>("personal");
  const [mobilePreview, setMobilePreview] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [generating, setGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState<string>();
  const [generated, setGenerated] = React.useState<(GeneratedCv & { sig: string }) | null>(null);
  const [suggestion, setSuggestion] = React.useState<{ text: string; notes: string } | null>(null);
  const [improving, setImproving] = React.useState(false);
  const [aiError, setAiError] = React.useState<string>();
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const sig = JSON.stringify([data, template, cvLang, photo?.length ?? 0, photo?.slice(-64)]);

  // Autosave on this device only (never sent anywhere until the candidate generates the PDF).
  React.useEffect(() => {
    const h = setTimeout(() => {
      try {
        localStorage.setItem(storeKey, JSON.stringify({ data, template, photo: photo && photo.length < 1_500_000 ? photo : null }));
        setSavedAt(Date.now());
      } catch {}
    }, 500);
    return () => clearTimeout(h);
  }, [data, template, photo, storeKey]);

  // Close on Escape; lock background scroll.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const set = <K extends keyof CvData>(k: K, v: CvData[K]) => setData((d) => ({ ...d, [k]: v }));
  const setP = (k: keyof CvData["personal"], v: string) => { setData((d) => ({ ...d, personal: { ...d.personal, [k]: v } })); setErrors((e) => ({ ...e, [k]: "" })); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (data.personal.fullName.trim().length < 2) e.fullName = t.errName;
    if (!emailRe.test(data.personal.email.trim())) e.email = t.errEmail;
    if (!urlOk(data.personal.linkedinUrl)) e.linkedinUrl = t.errUrl;
    if (!urlOk(data.personal.portfolioUrl)) e.portfolioUrl = t.errUrl;
    setErrors(e);
    if (Object.keys(e).length) setStep("personal");
    return !Object.keys(e).length;
  };

  const generate = async () => {
    if (!validate()) return;
    setGenerating(true);
    setGenError(undefined);
    try {
      const res = await fetch(generateUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgSlug, jobSlug, template, lang: cvLang, data, photo }) });
      const j = await res.json();
      if (!res.ok) {
        const d = (j.details as { path: string; message: string }[] | undefined)?.[0];
        throw new Error(d ? `${d.path.split(".").pop()}: ${d.message}` : j.error);
      }
      setGenerated({ ...j, template, sig });
      setMobilePreview(true);
    } catch (e) {
      setGenError((e as Error).message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  const improve = async () => {
    setImproving(true); setAiError(undefined); setSuggestion(null);
    try {
      const res = await fetch("/api/public/cv/improve-summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgSlug, jobSlug, summary: data.summary, headline: data.personal.headline, titles: data.experience.map((e) => e.title).filter(Boolean), skills: data.skills }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details?.[0]?.message ?? j.error);
      setSuggestion({ text: j.suggestion, notes: j.notes });
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setImproving(false);
    }
  };

  const stale = generated && generated.sig !== sig;
  const idx = STEPS.indexOf(step);
  const go = (d: number) => {
    const n = STEPS[Math.min(STEPS.length - 1, Math.max(0, idx + d))];
    if (step === "personal" && d > 0 && !validate()) return;
    setStep(n);
    document.getElementById("cvb-editor")?.scrollTo({ top: 0 });
  };
  const L = { reorder: t.reorder, delete: t.delete };

  const editor: Record<Step, React.ReactNode> = {
    personal: (
      <div className="grid gap-4 sm:grid-cols-2">
        <Text label={t.fullName} required value={data.personal.fullName} onChange={(v) => setP("fullName", v)} error={errors.fullName} autoComplete="name" className="sm:col-span-2" />
        <Text label={t.email} required type="email" value={data.personal.email} onChange={(v) => setP("email", v)} error={errors.email} autoComplete="email" className="sm:col-span-2" />
        <Text label={t.headline} value={data.personal.headline} onChange={(v) => setP("headline", v)} placeholder={t.headlinePh} className="sm:col-span-2" />
        <Text label={t.phone} type="tel" value={data.personal.phone} onChange={(v) => setP("phone", v)} autoComplete="tel" />
        <Text label={t.location} value={data.personal.location} onChange={(v) => setP("location", v)} autoComplete="address-level2" />
        <Text label={t.country} value={data.personal.country} onChange={(v) => setP("country", v)} autoComplete="country-name" />
        <Text label={t.linkedin} type="url" value={data.personal.linkedinUrl} onChange={(v) => setP("linkedinUrl", v)} error={errors.linkedinUrl} placeholder="https://www.linkedin.com/in/…" />
        <Text label={t.portfolio} type="url" value={data.personal.portfolioUrl} onChange={(v) => setP("portfolioUrl", v)} error={errors.portfolioUrl} placeholder="https://" className="sm:col-span-2" />
      </div>
    ),
    photo: (
      <div className="space-y-3">
        <p className="rounded-md bg-surface-2 p-3 text-sm text-muted-foreground">{t.photoNote}</p>
        <PhotoCropper shape={data.photoShape} onShape={(s) => set("photoShape", s)} value={photo} onChange={setPhoto} labels={t} />
      </div>
    ),
    summary: (
      <div className="space-y-3">
        <Area label={t.summaryLabel} value={data.summary} onChange={(v) => set("summary", v)} rows={6} placeholder={t.summaryPh} />
        {aiSummary ? (
          <button type="button" disabled={improving || data.summary.trim().length < 20} onClick={improve} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-50">
            {improving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-signal" />}{improving ? t.improving : t.improve}
          </button>
        ) : null}
        {aiError && <p role="alert" className="text-sm text-destructive">{aiError}</p>}
        {suggestion && (
          <div className="rounded-lg border border-signal/40 bg-signal-soft/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.suggestion}</p>
            <p className="mt-2 text-[15px] leading-relaxed">{suggestion.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t.suggestionNote}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => (set("summary", suggestion.text), setSuggestion(null))} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground"><Check className="size-3.5" />{t.useSuggestion}</button>
              <button type="button" onClick={() => setSuggestion(null)} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-accent">{t.keepMine}</button>
            </div>
          </div>
        )}
      </div>
    ),
    experience: (
      <div className="space-y-3">
        <SortableList items={data.experience} onChange={(v) => set("experience", v)} labels={L} render={(e, u) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label={t.jobTitle} value={e.title} onChange={(v) => u({ title: v })} />
            <Text label={t.company} value={e.company} onChange={(v) => u({ company: v })} />
            <Text label={t.start} value={e.start} onChange={(v) => u({ start: v })} placeholder="03/2021" />
            {!e.current ? <Text label={t.end} value={e.end} onChange={(v) => u({ end: v })} placeholder="06/2024" /> : <div className="flex items-end pb-2 text-sm text-muted-foreground">{t.present}</div>}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={e.current} onChange={(ev) => u({ current: ev.target.checked })} />{t.current}</label>
            <div className="sm:col-span-2"><Area label={t.description} value={e.description} onChange={(v) => u({ description: v })} rows={2} /></div>
            <div className="sm:col-span-2"><Area label={t.responsibilities} value={e.responsibilities} onChange={(v) => u({ responsibilities: v })} rows={3} /></div>
            <div className="sm:col-span-2"><Area label={t.achievements} value={e.achievements} onChange={(v) => u({ achievements: v })} rows={2} /></div>
          </div>
        )} />
        <AddButton onClick={() => set("experience", [...data.experience, { id: rid(), title: "", company: "", start: "", end: "", current: data.experience.length === 0, description: "", responsibilities: "", achievements: "" }])} label={t.addExperience} disabled={data.experience.length >= 20} />
      </div>
    ),
    education: (
      <div className="space-y-3">
        <SortableList items={data.education} onChange={(v) => set("education", v)} labels={L} render={(e, u) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label={t.institution} value={e.institution} onChange={(v) => u({ institution: v })} className="sm:col-span-2" />
            <Text label={t.degree} value={e.degree} onChange={(v) => u({ degree: v })} />
            <Text label={t.field} value={e.field} onChange={(v) => u({ field: v })} />
            <Text label={t.start} value={e.start} onChange={(v) => u({ start: v })} placeholder="2016" />
            <Text label={t.end} value={e.end} onChange={(v) => u({ end: v })} placeholder="2020" />
            <div className="sm:col-span-2"><Area label={t.description} value={e.description} onChange={(v) => u({ description: v })} rows={2} /></div>
          </div>
        )} />
        <AddButton onClick={() => set("education", [...data.education, { id: rid(), institution: "", degree: "", field: "", start: "", end: "", description: "" }])} label={t.addEducation} disabled={data.education.length >= 15} />
      </div>
    ),
    skills: (
      <div className="space-y-6">
        <TagInput label={t.skills} value={data.skills} onChange={(v) => set("skills", v)} placeholder={t.skillsPh} suggestions={[...new Set([...jobSkills, ...COMMON_SKILLS])]} suggestionsLabel={t.suggestions} />
        <div>
          <span className="mb-2 block text-sm font-medium">{t.languages}</span>
          <div className="space-y-2">
            {data.languages.map((l) => (
              <div key={l.id} className="flex items-end gap-2">
                <Text label={t.language} value={l.language} onChange={(v) => set("languages", data.languages.map((x) => (x.id === l.id ? { ...x, language: v } : x)))} className="flex-1" />
                <label className="block flex-1">
                  <span className="mb-1 block text-sm font-medium">{t.level}</span>
                  <select value={l.level} onChange={(e) => set("languages", data.languages.map((x) => (x.id === l.id ? { ...x, level: e.target.value } : x)))} className={cn(inputCls, "h-10")}>
                    <option value="">-</option>
                    {t.levels.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                  </select>
                </label>
                <button type="button" aria-label={t.delete} onClick={() => set("languages", data.languages.filter((x) => x.id !== l.id))} className="mb-1 rounded p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
          <AddButton className="mt-2" onClick={() => set("languages", [...data.languages, { id: rid(), language: "", level: "" }])} label={t.addLanguage} disabled={data.languages.length >= 15} />
        </div>
      </div>
    ),
    more: (
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t.certifications}</h3>
          <SortableList items={data.certifications} onChange={(v) => set("certifications", v)} labels={L} render={(c, u) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label={t.certName} value={c.name} onChange={(v) => u({ name: v })} className="sm:col-span-2" />
              <Text label={t.issuer} value={c.issuer} onChange={(v) => u({ issuer: v })} />
              <Text label={t.date} value={c.date} onChange={(v) => u({ date: v })} placeholder="2023" />
              <Text label={t.url} type="url" value={c.url} onChange={(v) => u({ url: v })} placeholder="https://" className="sm:col-span-2" error={urlOk(c.url) ? undefined : t.errUrl} />
            </div>
          )} />
          <AddButton onClick={() => set("certifications", [...data.certifications, { id: rid(), name: "", issuer: "", date: "", url: "" }])} label={t.addCert} disabled={data.certifications.length >= 20} />
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t.projects}</h3>
          <SortableList items={data.projects} onChange={(v) => set("projects", v)} labels={L} render={(p, u) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label={t.projectName} value={p.name} onChange={(v) => u({ name: v })} />
              <Text label={t.role} value={p.role} onChange={(v) => u({ role: v })} />
              <div className="sm:col-span-2"><Area label={t.description} value={p.description} onChange={(v) => u({ description: v })} rows={2} /></div>
              <Text label={t.technologies} value={p.technologies} onChange={(v) => u({ technologies: v })} />
              <Text label={t.url} type="url" value={p.url} onChange={(v) => u({ url: v })} placeholder="https://" error={urlOk(p.url) ? undefined : t.errUrl} />
            </div>
          )} />
          <AddButton onClick={() => set("projects", [...data.projects, { id: rid(), name: "", role: "", description: "", technologies: "", url: "" }])} label={t.addProject} disabled={data.projects.length >= 20} />
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t.additional}</h3>
          {(["publications", "awards", "volunteering", "links", "other"] as const).map((k) => (
            <Area key={k} label={t[k]} value={data.additional[k]} onChange={(v) => set("additional", { ...data.additional, [k]: v })} rows={2} />
          ))}
        </section>
      </div>
    ),
    finish: (
      <div className="space-y-4">
        <TemplatePicker templates={templates} value={template} onChange={setTemplate} t={t} />
        {genError && <p role="alert" className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">{genError}</p>}
        {!generated || stale ? (
          <>
            {stale && <p className="rounded-md bg-signal-soft/60 p-3 text-sm">{t.stale}</p>}
            <button type="button" disabled={generating} onClick={generate} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-70">
              {generating ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}{generating ? t.generating : generated ? t.regenerate : t.generate}
            </button>
          </>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="flex items-center gap-2 font-medium"><Check className="size-4 text-success" />{t.pdfReady}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.pdfReadyHint}</p>
            <p className="mt-3 flex items-center gap-2 text-sm"><FileText className="size-4 text-muted-foreground" />{generated.fileName} · {Math.max(1, Math.round(generated.sizeBytes / 1024))} KB</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => onUse(generated, data)} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="size-4" />{t.useThis}</button>
              <a href={`${generated.previewUrl}?download=1`} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"><Download className="size-4" />{t.download}</a>
              <a href={generated.previewUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"><Eye className="size-4" />{t.preview}</a>
            </div>
          </div>
        )}
      </div>
    ),
  };

  const preview = generated && !stale ? (
    <iframe title={t.preview} src={`${generated.previewUrl}#view=FitH`} className="h-[calc(100vh-9rem)] w-full rounded-md border border-border bg-white" />
  ) : (
    <CvPreview data={data} template={template} lang={cvLang} photo={photo} />
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-labelledby="cvb-title">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <h2 id="cvb-title" className="font-display text-xl">{t.title}</h2>
        <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">{savedAt ? `✓ ${t.saved}` : ""}</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="hidden items-center gap-1.5 text-sm sm:flex">
            <span className="text-muted-foreground">{t.cvLanguage}</span>
            <select value={cvLang} onChange={(e) => setCvLang(e.target.value as CvLang)} className="h-8 rounded-md border border-input bg-surface px-2 text-sm"><option value="en">English</option><option value="el">Ελληνικά</option></select>
          </label>
          <button type="button" onClick={() => setMobilePreview((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm lg:hidden">{mobilePreview ? <><Pencil className="size-3.5" />{t.hidePreview}</> : <><Eye className="size-3.5" />{t.showPreview}</>}</button>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-5" /></button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div id="cvb-editor" className={cn("min-h-0 overflow-y-auto", mobilePreview && "hidden lg:block")}>
          <nav aria-label="Sections" className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
            {STEPS.map((s, i) => (
              <button key={s} type="button" onClick={() => (s === "personal" || validate() ? setStep(s) : undefined)} aria-current={s === step ? "step" : undefined}
                className={cn("shrink-0 rounded-full px-3 py-1 text-sm", s === step ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <span className="tabular mr-1 opacity-60">{i + 1}</span>{t.steps[s]}
              </button>
            ))}
          </nav>
          <div className="mx-auto max-w-2xl px-4 py-6">
            <h3 className="mb-4 text-lg font-semibold">{t.steps[step]}</h3>
            {editor[step]}
            <div className="mt-8 flex justify-between border-t border-border pt-4">
              <button type="button" onClick={() => go(-1)} disabled={idx === 0} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:invisible"><ArrowLeft className="size-4" />{t.back}</button>
              {step !== "finish" && <button type="button" onClick={() => go(1)} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">{t.next}<ArrowRight className="size-4" /></button>}
            </div>
          </div>
        </div>
        <div className={cn("min-h-0 overflow-y-auto border-l border-border bg-surface-2 p-4 sm:p-6", !mobilePreview && "hidden lg:block")}>
          <div className="mx-auto max-w-[640px]">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{generated && !stale ? "PDF" : t.livePreview} · {t.templates[template]}</span>
              {step !== "finish" && <button type="button" onClick={() => (setStep("finish"), setMobilePreview(false))} className="font-medium text-foreground underline-offset-2 hover:underline">{t.generate}</button>}
            </div>
            {/* On phones the preview hides the editor, so the generated PDF's actions are repeated here. */}
            {generated && !stale && (
              <div className="mb-3 flex flex-wrap gap-2 lg:hidden">
                <button type="button" onClick={() => onUse(generated, data)} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="size-4" />{t.useThis}</button>
                <a href={`${generated.previewUrl}?download=1`} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm hover:bg-accent"><Download className="size-4" />{t.download}</a>
              </div>
            )}
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddButton({ onClick, label, disabled, className }: { onClick: () => void; label: string; disabled?: boolean; className?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border-strong px-3 text-sm hover:bg-accent disabled:opacity-50", className)}><Plus className="size-4" />{label}</button>;
}

function TemplatePicker({ templates, value, onChange, t }: { templates: CvTemplate[]; value: CvTemplate; onChange: (v: CvTemplate) => void; t: (typeof builderDict)["en"] | (typeof builderDict)["el"] }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{t.template}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {templates.map((tp) => (
          <label key={tp} className={cn("cursor-pointer rounded-lg border p-3 text-sm transition-colors", value === tp ? "border-primary bg-accent" : "border-border hover:border-foreground/30")}>
            <input type="radio" name="cv-template" value={tp} checked={value === tp} onChange={() => onChange(tp)} className="sr-only" />
            <span className={cn("block font-medium", tp === "professional" && "font-serif")}>{t.templates[tp]}</span>
            <span className="text-xs text-muted-foreground">{t.templateHints[tp]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
