"use client";
import Link from "next/link";
import { LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/shell/brand-mark";
import { Button } from "@/components/ui/button";
import { useMe, signOut } from "@/lib/session";

export function PlainTopBar() {
  const me = useMe();
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border px-4 sm:px-6">
      <Link href="/app" aria-label="My companies"><BrandLogo height={20} /></Link>
      <div className="ml-auto flex items-center gap-2">
        {me?.user.isPlatformAdmin && <Button variant="ghost" size="sm" asChild><Link href="/admin"><ShieldCheck />Platform admin</Link></Button>}
        {me && <span className="hidden text-sm text-muted-foreground sm:inline">{me.user.email}</span>}
        <Button variant="ghost" size="sm" asChild><Link href="/account"><LockKeyhole />Account &amp; security</Link></Button>
        <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut />Sign out</Button>
      </div>
    </header>
  );
}
