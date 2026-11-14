"use client";
import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, Download, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { apiFetch, type ApiError } from "@/lib/api/store";
import { PlainTopBar } from "@/components/onboarding/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/controls";

type Status = { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number };

function Card({ title, icon, children, aside }: { title: string; icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </section>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = `Ulysse recovery codes\n${codes.join("\n")}\n\nEach code works once. Keep them somewhere safe, away from your phone.`;
  const [saved, setSaved] = React.useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm">Save these recovery codes now. If you lose your phone, each one lets you sign in once. <strong>They won&apos;t be shown again.</strong></p>
      <ul className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm" aria-label="Recovery codes">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success("Copied"))}><Copy />Copy</Button>
        <Button size="sm" variant="outline" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = "ulysse-recovery-codes.txt"; a.click(); URL.revokeObjectURL(a.href); }}><Download />Download</Button>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I&apos;ve saved my recovery codes</label>
      <Button disabled={!saved} onClick={onDone}><Check />Done</Button>
    </div>
  );
}

function TwoFactor({ status, reload }: { status: Status; reload: () => void }) {
  const [stage, setStage] = React.useState<"idle" | "password" | "scan" | "codes" | "disable" | "regen">("idle");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [setup, setSetup] = React.useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const reset = () => { setStage("idle"); setPassword(""); setCode(""); setSetup(null); setError(undefined); setBusy(false); };
  const call = async <T,>(url: string, body: unknown, then: (r: T) => void) => {
    setBusy(true); setError(undefined);
    try { then(await apiFetch<T>(url, { method: "POST", body: JSON.stringify(body) })); } catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };
  const codeInput = (label = "6-digit code from your app") => (
    <Field label={label} htmlFor="totp"><Input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={stage === "disable" ? 20 : 6} value={code} onChange={(e) => setCode(stage === "disable" ? e.target.value : e.target.value.replace(/\D/g, ""))} placeholder="123456" className="w-40" /></Field>
  );
  const err = error && <p role="alert" className="text-sm text-destructive">{error}</p>;

  if (stage === "codes") return <RecoveryCodes codes={codes} onDone={() => { reset(); reload(); }} />;
  if (!status.enabled) {
    if (stage === "idle") return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Besides your password, sign-in also asks for a code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). Someone who learns your password still can&apos;t get in.</p>
        <Button onClick={() => setStage("password")}><Smartphone />Turn on two-step verification</Button>
      </div>
    );
    if (stage === "password") return (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void call<{ secret: string; qrSvg: string }>("/api/me/two-factor/setup", { password }, (r) => { setSetup(r); setStage("scan"); }); }}>
        <Field label="Confirm your password" htmlFor="pw"><Input id="pw" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-xs" /></Field>
        {err}
        <div className="flex gap-2"><Button type="submit" disabled={busy || !password}>Continue</Button><Button type="button" variant="ghost" onClick={reset}>Cancel</Button></div>
      </form>
    );
    return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void call<{ recoveryCodes: string[] }>("/api/me/two-factor/enable", { code }, (r) => { setCodes(r.recoveryCodes); setStage("codes"); reload(); }); }}>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open your authenticator app and add an account (usually <strong>+</strong>).</li>
          <li>Scan this QR code, or type the key below.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        {/* The SVG comes from our own server (qrcode library), shown as an image, never as HTML. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {setup && <img alt="QR code for your authenticator app" className="size-44 rounded-lg border border-border bg-white p-2" src={`data:image/svg+xml;base64,${btoa(setup.qrSvg)}`} />}
        {setup && <p className="text-xs text-muted-foreground">Key: <code className="select-all font-mono text-foreground">{setup.secret}</code></p>}
        {codeInput()}
        {err}
        <div className="flex gap-2"><Button type="submit" disabled={busy || code.length !== 6}>Turn on</Button><Button type="button" variant="ghost" onClick={reset}>Cancel</Button></div>
      </form>
    );
  }
  if (stage === "disable") return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void call("/api/me/two-factor/disable", { password, code }, () => { toast.success("Two-step verification turned off"); reset(); reload(); }); }}>
      <p className="text-sm text-muted-foreground">Your account will be protected by your password only.</p>
      <Field label="Your password" htmlFor="pw"><Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-xs" /></Field>
      {codeInput("Code from your app (or a recovery code)")}
      {err}
      <div className="flex gap-2"><Button type="submit" variant="destructive" disabled={busy || !password || code.length < 6}>Turn off</Button><Button type="button" variant="ghost" onClick={reset}>Cancel</Button></div>
    </form>
  );
  if (stage === "regen") return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void call<{ recoveryCodes: string[] }>("/api/me/two-factor/recovery-codes", { code }, (r) => { setCodes(r.recoveryCodes); setStage("codes"); }); }}>
      <p className="text-sm text-muted-foreground">Your old recovery codes will stop working.</p>
      {codeInput()}
      {err}
      <div className="flex gap-2"><Button type="submit" disabled={busy || code.length !== 6}>Create new codes</Button><Button type="button" variant="ghost" onClick={reset}>Cancel</Button></div>
    </form>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm">Sign-in asks for a code from your authenticator app. <span className="text-muted-foreground">{status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? "" : "s"} left.</span></p>
      {status.recoveryCodesLeft <= 3 && <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">You&apos;re running low on recovery codes. Create a new set.</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setStage("regen")}><KeyRound />New recovery codes</Button>
        <Button size="sm" variant="destructive-ghost" onClick={() => setStage("disable")}>Turn off</Button>
      </div>
    </div>
  );
}

function PasswordChange() {
  const [f, setF] = React.useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  return (
    <form
      className="grid max-w-md gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (f.newPassword.length < 10) return setError("Use at least 10 characters");
        if (f.newPassword !== f.confirm) return setError("The new passwords don't match");
        setBusy(true); setError(undefined);
        try {
          await apiFetch("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword: f.currentPassword, newPassword: f.newPassword }) });
          toast.success("Password changed", { description: "You've been signed out on your other devices." });
          setF({ currentPassword: "", newPassword: "", confirm: "" });
        } catch (err) { setError((err as ApiError).message); }
        setBusy(false);
      }}
    >
      <Field label="Current password" htmlFor="cur"><Input id="cur" type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
      <Field label="New password" hint="At least 10 characters. Use one you don't use anywhere else." htmlFor="new"><Input id="new" type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
      <Field label="Repeat new password" htmlFor="rep"><Input id="rep" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div><Button type="submit" disabled={busy || !f.currentPassword || !f.newPassword}>Change password</Button></div>
    </form>
  );
}

export function AccountSecurity({ email, name }: { email: string; name: string }) {
  const [status, setStatus] = React.useState<Status | null>(null);
  const reload = React.useCallback(() => { apiFetch<{ twoFactor: Status }>("/api/me/security").then((r) => setStatus(r.twoFactor)).catch(() => {}); }, []);
  React.useEffect(() => { reload(); }, [reload]);
  return (
    <div className="min-h-dvh">
      <PlainTopBar />
      <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Account &amp; security</h1>
          <p className="mt-1 text-sm text-muted-foreground">{name} · {email}</p>
        </div>
        <Card title="Two-step verification" icon={<ShieldCheck />} aside={status && (status.enabled ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>)}>
          {status ? <TwoFactor status={status} reload={reload} /> : <Skeleton className="h-16" />}
        </Card>
        <Card title="Password" icon={<KeyRound />}><PasswordChange /></Card>
      </main>
    </div>
  );
}
