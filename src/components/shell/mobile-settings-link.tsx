"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_NAV, isActive } from "./nav-items";

export function NavLinkMobileSettings({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const Icon = SETTINGS_NAV.icon;
  return (
    <Link href={SETTINGS_NAV.href} onClick={onNavigate} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium", isActive(pathname, "/settings") ? "bg-sidebar-active shadow-sm" : "text-sidebar-foreground hover:bg-accent")}>
      <Icon className="size-4 text-subtle-foreground" />
      Settings
    </Link>
  );
}
