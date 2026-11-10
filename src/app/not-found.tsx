import Link from "next/link";
import { BRAND } from "@/config/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-display text-5xl italic">{BRAND.name}</p>
      <h1 className="text-base font-semibold">This page doesn&apos;t exist</h1>
      <p className="max-w-sm text-sm text-muted-foreground">The link may be broken, or the page may have moved.</p>
      <Link href="/" className="mt-2 inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Back to overview</Link>
    </div>
  );
}
