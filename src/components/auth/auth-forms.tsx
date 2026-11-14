"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { apiFetch, type ApiError } from "@/lib/api/store";

function useNext() {
  const sp = useSearchParams();
  const n = sp.get("next");
  // Same-site paths only: browsers treat "//host" and "/\host" as other sites (open redirect).
  return n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/";
}

export function LoginForm() {
  const next = useNext();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [ticket, setTicket] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [useRecovery, setUseRecovery] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try { await fn(); } catch (err) { setError((err as ApiError).message); setBusy(false); }
  };
  if (ticket) {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim()) return setError(useRecovery ? "Enter one of your recovery codes" : "Enter the 6-digit code");
          void run(async () => {
            const r = await apiFetch<{ recoveryCodesLeft?: number }>("/api/auth/login/verify", { method: "POST", body: JSON.stringify({ ticket, code }) });
            if (r.recoveryCodesLeft !== undefined) window.alert(`You used a recovery code. ${r.recoveryCodesLeft} left. Create new ones in Account & security.`);
            window.location.href = next;
          });
        }}
        className="space-y-4"
      >
        <p className="text-sm text-muted-foreground">{useRecovery ? "Enter one of the recovery codes you saved when you turned on two-step verification." : "Open your authenticator app and enter the 6-digit code for Ulysse."}</p>
        <Field label={useRecovery ? "Recovery code" : "Verification code"} htmlFor="code">
          <Input id="code" autoFocus autoComplete="one-time-code" inputMode={useRecovery ? "text" : "numeric"} maxLength={useRecovery ? 20 : 6} placeholder={useRecovery ? "xxxx-xxxx-xxxx" : "123456"} value={code} onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, ""))} />
        </Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy ? "Checking…" : "Verify"}</Button>
        <div className="flex justify-between text-xs">
          <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => (setUseRecovery(!useRecovery), setCode(""), setError(undefined))}>{useRecovery ? "Use the authenticator app" : "Use a recovery code"}</button>
          <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => (setTicket(null), setCode(""), setPassword(""), setError(undefined))}>Back</button>
        </div>
      </form>
    );
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!email || !password) return setError("Enter your email and password");
        void run(async () => {
          const r = await apiFetch<{ ok?: boolean; mfaRequired?: boolean; ticket?: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
          if (r.mfaRequired && r.ticket) { setTicket(r.ticket); setBusy(false); return; }
          window.location.href = next;
        });
      }}
      className="space-y-4"
    >
      <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}

export function SignupForm() {
  const next = useNext();
  const [f, setF] = React.useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => (setF((s) => ({ ...s, [k]: e.target.value })), setErrors((x) => ({ ...x, [k]: "", form: "" })));
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (f.name.trim().length < 2) errs.name = "Enter your name";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.email = "Enter a valid email";
        if (f.password.length < 10) errs.password = "Use at least 10 characters";
        setErrors(errs);
        if (Object.keys(errs).length) return;
        setBusy(true);
        try {
          await apiFetch("/api/auth/signup", { method: "POST", body: JSON.stringify(f) });
          window.location.href = next === "/" ? "/app" : next;
        } catch (err) {
          setErrors({ form: (err as ApiError).message });
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <Field label="Full name" htmlFor="name" error={errors.name}><Input id="name" autoComplete="name" autoFocus value={f.name} onChange={set("name")} aria-invalid={!!errors.name || undefined} /></Field>
      <Field label="Work email" htmlFor="email" error={errors.email}><Input id="email" type="email" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={!!errors.email || undefined} /></Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters." error={errors.password}><Input id="password" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} aria-invalid={!!errors.password || undefined} /></Field>
      {errors.form && <p role="alert" className="text-sm text-destructive">{errors.form}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [done, setDone] = React.useState(false);
  if (done) return <div className="space-y-4"><p className="text-sm">Your password has been updated. All other sessions were signed out.</p><Button className="w-full" onClick={() => router.push("/login")}>Sign in</Button></div>;
  return (
    <form noValidate className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (pw.length < 10) return setError("Use at least 10 characters");
      try { await apiFetch("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password: pw }) }); setDone(true); } catch (err) { setError((err as ApiError).message); }
    }}>
      <Field label="New password" error={error}><Input type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => (setPw(e.target.value), setError(undefined))} /></Field>
      <Button type="submit" className="w-full" size="lg">Set password</Button>
    </form>
  );
}

export function InviteAccept({ token }: { token: string }) {
  const [info, setInfo] = React.useState<{ companyName: string; email: string; role: string; signedInAs: string | null; emailMatches: boolean | null } | null>(null);
  const [error, setError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    apiFetch<typeof info>(`/api/invitations/${token}`).then(setInfo).catch((e: ApiError) => setError(e.message));
  }, [token]);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!info) return <p className="text-sm text-muted-foreground">Checking invitation…</p>;
  const here = `/invite/${token}`;
  return (
    <div className="space-y-4">
      <p className="text-sm">You&apos;ve been invited to join <strong className="font-medium">{info.companyName}</strong> as <strong className="font-medium">{info.role}</strong>.</p>
      {!info.signedInAs ? (
        <div className="grid gap-2">
          <Button asChild size="lg"><Link href={`/signup?next=${encodeURIComponent(here)}`}>Create an account</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href={`/login?next=${encodeURIComponent(here)}`}>I already have an account</Link></Button>
          <p className="text-xs text-muted-foreground">Use {info.email}.</p>
        </div>
      ) : !info.emailMatches ? (
        <p className="text-sm text-destructive">You&apos;re signed in as {info.signedInAs}, but this invitation is for {info.email}. Sign out and sign in with the invited email.</p>
      ) : (
        <Button size="lg" className="w-full" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const r = await apiFetch<{ slug: string }>(`/api/invitations/${token}`, { method: "POST" }); window.location.href = `/app/${r.slug}/dashboard`; } catch (e) { setError((e as ApiError).message); setBusy(false); }
        }}>{busy ? "Joining…" : `Join ${info.companyName}`}</Button>
      )}
    </div>
  );
}
