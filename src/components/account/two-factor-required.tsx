import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/** Shown instead of a page that needs two-step verification the user hasn't turned on yet. */
export function TwoFactorRequired({ title, reason, next, back }: { title: string; reason: string; next: string; back?: { href: string; label: string } }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <ShieldCheck className="size-8 text-muted-foreground" />
      <h1 className="text-base font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{reason} It takes a minute: you scan a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and from then on sign in with your password plus a 6-digit code.</p>
      <Link href={`/account?next=${encodeURIComponent(next)}`} className="mt-2 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Turn on two-step verification</Link>
      {back && <Link href={back.href} className="text-sm underline underline-offset-2">{back.label}</Link>}
    </main>
  );
}
