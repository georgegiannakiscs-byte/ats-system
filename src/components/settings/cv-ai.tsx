"use client";
import * as React from "react";
import { toast } from "sonner";
import { useCan, useDb } from "@/lib/api/store";
import { api } from "@/lib/api";
import { Switch, Select } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import type { AiFeatureKey } from "@/lib/types";

const TEMPLATE_LABEL: Record<string, string> = { minimal: "Minimal — most ATS-friendly", modern: "Modern", professional: "Professional (serif)" };
const panel = "rounded-xl border border-border bg-surface shadow-xs";

export function CvBuilderSettings() {
  const db = useDb();
  const can = useCan("settings.manage");
  const s = db.cvSettings;
  if (db.org.features.cv_builder === false) return <p className={`${panel} p-5 text-sm text-muted-foreground`}>The CV Builder isn&apos;t enabled for this company by the platform administrator.</p>;
  const available = s.platformTemplates;
  const enabled = s.templates.filter((t) => available.includes(t));
  const toggle = (t: string, on: boolean) => {
    const next = on ? [...new Set([...enabled, t])] : enabled.filter((x) => x !== t);
    if (!next.length) return toast.error("Keep at least one template enabled");
    api.assessments.saveCvSettings({ templates: next, defaultTemplate: next.includes(s.defaultTemplate) ? s.defaultTemplate : next[0] }).then(() => toast.success("Saved"), () => {});
  };
  return (
    <div className="space-y-4">
      <div className={panel}>
        <div className="border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold">CV templates</h3>
          <p className="text-xs text-muted-foreground">Candidates without a CV can build one on your job pages. Only name, email and CV stay mandatory.</p>
        </div>
        <ul className="divide-y divide-border">
          {available.map((t) => (
            <li key={t}><label className="flex items-center gap-4 px-5 py-3"><span className="flex-1 text-sm">{TEMPLATE_LABEL[t] ?? t}</span><Switch disabled={!can} checked={enabled.includes(t)} onCheckedChange={(v) => toggle(t, v)} aria-label={TEMPLATE_LABEL[t] ?? t} /></label></li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-border px-5 py-3">
          <span className="flex-1 text-sm">Default template</span>
          <Select className="w-56" value={s.defaultTemplate} onValueChange={(v) => api.assessments.saveCvSettings({ defaultTemplate: v }).then(() => toast.success("Saved"), () => {})} options={enabled.map((t) => ({ value: t, label: TEMPLATE_LABEL[t] ?? t }))} />
        </div>
      </div>
      <div className={panel}>
        <label className="flex items-center gap-4 px-5 py-4">
          <span className="flex-1"><span className="block text-sm font-medium">Hide candidate photos during screening</span><span className="block text-xs text-muted-foreground">Photos are always optional and never used by AI. When on, uploaded photos aren&apos;t shown in candidate profiles. Photos a candidate places inside their own PDF CV remain part of that document.</span></span>
          <Switch disabled={!can} checked={s.hidePhotos} onCheckedChange={(v) => api.assessments.saveCvSettings({ hidePhotos: v }).then(() => toast.success(v ? "Photos hidden" : "Photos shown"), () => {})} aria-label="Hide candidate photos" />
        </label>
      </div>
    </div>
  );
}

const AI_FEATURES: { key: AiFeatureKey; flag: string; label: string; description: string }[] = [
  { key: "question_generation", flag: "ai_question_generation", label: "Draft Quick Check questions", description: "Claude drafts questions from job descriptions. Every draft needs approval by your team." },
  { key: "cv_summary", flag: "ai_cv_assist", label: "Candidate summary wording help", description: "Candidates can ask for clearer wording of their own summary in the CV Builder and decide whether to use it." },
  { key: "cv_extract", flag: "ai_cv_assist", label: "Read an uploaded CV into the builder", description: "Copies what's in a candidate's file into the builder for them to review. Contact details are found without AI." },
  { key: "response_observations", flag: "ai_assessment_observations", label: "Observations on written Quick Check answers", description: "Descriptive notes and follow-up questions for reviewers. No scores or recommendations. Requires a legal, fairness and human-oversight review before use." },
];

export function AiSettings() {
  const db = useDb();
  const can = useCan("settings.manage");
  return (
    <div className="space-y-4">
      <div className={`${panel} px-5 py-4 text-sm`}>
        <p className="font-medium">Anthropic Claude {db.ai.configured ? <Badge tone="success" className="ml-1">API key configured</Badge> : <Badge tone="muted" className="ml-1">Not configured</Badge>}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {db.ai.configured ? `Model: ${db.ai.model}. Requests run on Déceler's servers; your API key is never sent to browsers.` : "The platform has no Anthropic API key configured. Everything still works without AI: manual questions, approved question sets and automatic answer-key checks."}
          {" "}Candidate photos are never sent to AI. AI never decides who moves forward.
        </p>
      </div>
      <div className={panel}>
        <ul className="divide-y divide-border">
          {AI_FEATURES.map((f) => {
            const entitled = db.org.features[f.flag] !== false;
            const reason = db.ai.unavailable[f.key];
            return (
              <li key={f.key}>
                <label className="flex items-center gap-4 px-5 py-3.5">
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{f.label}</span>
                    <span className="block text-xs text-muted-foreground">{f.description}</span>
                    {!entitled ? <span className="mt-1 block text-xs text-warning">Not enabled for this company by the platform administrator.</span> : reason && db.aiSettings[f.key] ? <span className="mt-1 block text-xs text-muted-foreground">Currently unavailable: {reason}</span> : null}
                  </span>
                  <Switch disabled={!can || !entitled} checked={entitled && db.aiSettings[f.key] !== false} onCheckedChange={(v) => api.assessments.saveAiSettings({ [f.key]: v }).then(() => toast.success("Saved"), () => {})} aria-label={f.label} />
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
