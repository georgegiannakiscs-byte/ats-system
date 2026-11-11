"use client";
import * as React from "react";
import { CheckCircle2, Clock, Loader2, ShieldCheck, WifiOff } from "lucide-react";
import { quickCheckDict, fmtT } from "@/lib/i18n/cv-builder";
import { cn } from "@/lib/utils";
import type { AttemptView } from "@/server/assessments";

type View = AttemptView & { late?: boolean };
type Acc = "none" | "extended" | "untimed";

/**
 * Candidate Quick Check. The server owns the clock: each question has a deadline set when it
 * is served. The countdown here only displays it; when it reaches zero we ask the server for
 * the next state, which records the question as unanswered.
 */
export function QuickCheck({ token, initial }: { token: string; initial: View }) {
  const t = quickCheckDict[initial.language];
  const [view, setView] = React.useState<View>(initial);
  const [acc, setAcc] = React.useState<Acc>("none");
  const [choice, setChoice] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const [offline, setOffline] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  // Local deadline = receipt time + remaining time from the server (immune to clock skew).
  const [deadline, setDeadline] = React.useState<number | null>(() => (initial.current?.remainingMs != null ? Date.now() + initial.current.remainingMs : null));
  const url = `/api/public/assessments/${token}`;

  const receive = React.useCallback((v: View, expired = false) => {
    setView(v);
    setNotice(expired || v.late ? t.timeUp : undefined);
    setDeadline(v.current?.remainingMs != null ? Date.now() + v.current.remainingMs : null);
    setChoice(null);
    setText("");
  }, [t.timeUp]);

  const call = React.useCallback(async (body?: Record<string, unknown>): Promise<View | null> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
        const j = await res.json();
        setOffline(false);
        if (!res.ok) { setError(j.error); return null; }
        return j as View;
      } catch {
        setOffline(true);
        if (attempt >= 6) return null;
        await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** attempt)));
      }
    }
  }, [url]);

  // Tick, and ask the server for the next state once the displayed time has run out.
  const expiring = React.useRef(false);
  React.useEffect(() => {
    if (view.status !== "started") return;
    const h = setInterval(async () => {
      setNow(Date.now());
      if (deadline && Date.now() > deadline + 3500 && !expiring.current) {
        expiring.current = true;
        const v = await call();
        expiring.current = false;
        if (v) receive(v, true);
      }
    }, 250);
    return () => clearInterval(h);
  }, [view.status, deadline, call, receive]);

  React.useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setError(undefined);
    const v = await call(body);
    if (v) receive(v);
    setBusy(false);
  };

  const card = "mx-auto my-10 max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8";

  if (view.status === "completed")
    return (
      <div className={cn(card, "text-center")} role="status">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h1 className="mt-3 text-xl font-semibold">{t.done}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{fmtT(t.doneNote, { company: view.company.name })}</p>
      </div>
    );
  if (view.status === "declined" || view.status === "expired")
    return <div className={cn(card, "text-center text-sm text-muted-foreground")} role="status">{view.status === "declined" ? t.declined : t.expired}</div>;

  if (view.status === "invited") {
    const secs = view.secondsPerQuestion ?? 0;
    const minutes = Math.max(1, Math.round((view.total * (secs || 45)) / 60));
    const options: Acc[] = ["none", ...(view.allowExtendedTime ? (["extended"] as const) : []), ...(view.allowUntimed ? (["untimed"] as const) : [])];
    return (
      <div className={card}>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{view.company.name}</p>
        <h1 className="mt-1 font-display text-3xl tracking-tight">{t.introTitle}</h1>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[[t.position, view.jobTitle], [t.questions, String(view.total)], [t.duration, `~${minutes} min`], [t.timing, view.timed ? `${secs}s / q` : t.noLimit]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
          ))}
        </dl>
        {view.instructions && <p className="mt-5 whitespace-pre-line rounded-lg border border-border p-4 text-sm leading-relaxed">{view.instructions}</p>}
        <h2 className="mt-6 text-sm font-semibold">{t.howItWorks}</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/85">
          <li>{view.timed ? fmtT(t.timedHow, { s: secs }) : t.untimedHow}</li>
          {t.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {view.timed && options.length > 1 && (
          <fieldset className="mt-6 rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-semibold">{t.accommodation}</legend>
            <p className="text-sm text-muted-foreground">{t.accommodationNote}</p>
            <div className="mt-3 space-y-2">
              {options.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="accommodation" value={o} checked={acc === o} onChange={() => setAcc(o)} />
                  {t.acc[o]}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="mt-6 flex gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />{fmtT(t.privacy, { company: view.company.name })}</p>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => act({ action: "start", accommodation: acc })} className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-70">
            {busy && <Loader2 className="size-4 animate-spin" />}{t.startButton}
          </button>
          <button type="button" disabled={busy} onClick={() => act({ action: "decline" })} className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{t.decline}</button>
        </div>
      </div>
    );
  }

  const q = view.current!;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const total = view.accommodation === "extended" && view.secondsPerQuestion ? view.secondsPerQuestion * 2 : view.secondsPerQuestion;
  const canSubmit = q.type === "multiple_choice" ? Boolean(choice) : text.trim().length > 0;
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{fmtT(t.question, { i: q.position + 1, n: view.total })}</span>
        {remaining != null ? (
          <span role="timer" aria-live={remaining <= 10 ? "assertive" : "off"} className={cn("tabular inline-flex items-center gap-1 rounded-full px-2.5 py-0.5", remaining <= 10 ? "bg-signal-soft text-signal" : "bg-surface-2 text-muted-foreground")}>
            <Clock className="size-3.5" />{fmtT(t.timeLeft, { s: remaining })}
          </span>
        ) : <span className="text-muted-foreground">{t.noLimit}</span>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={view.total} aria-valuenow={q.position} aria-label="Progress">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${(q.position / view.total) * 100}%` }} />
      </div>
      {remaining != null && total ? <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-transparent" aria-hidden><div className="h-full bg-signal/60 transition-[width] duration-300" style={{ width: `${Math.min(100, (remaining / total) * 100)}%` }} /></div> : null}
      {notice && <p role="status" className="mt-4 rounded-md bg-surface-2 p-3 text-sm">{notice}</p>}
      {offline && <p role="alert" className="mt-4 flex items-center gap-2 rounded-md bg-signal-soft p-3 text-sm"><WifiOff className="size-4" />{t.offline}</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) act({ action: "answer", position: q.position, optionId: choice, text }); }}>
        <fieldset className="mt-6" disabled={busy}>
          <legend className="text-[17px] font-medium leading-relaxed">{q.text}</legend>
          {q.type === "multiple_choice" ? (
            <div className="mt-4 space-y-2">
              {q.options.map((o) => (
                <label key={o.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-[15px] transition-colors", choice === o.id ? "border-primary bg-accent" : "border-border hover:border-foreground/30")}>
                  <input type="radio" name={`q${q.position}`} value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} className="mt-1" />
                  <span><span className="mr-2 font-medium text-muted-foreground">{o.id}.</span>{o.text}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea aria-label={q.text} value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} placeholder={t.writePh} className="mt-4 w-full rounded-md border border-input bg-surface p-3 text-[15px] outline-none focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring" />
          )}
        </fieldset>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" disabled={busy} onClick={() => act({ action: "skip", position: q.position })} className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{t.skip}</button>
          <button type="submit" disabled={busy || !canSubmit} className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />}{t.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
