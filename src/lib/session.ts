"use client";
import { useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api/store";

export interface MeCompany { id: string; slug: string; name: string; status: string; role: string; roleLabel: string; logoUrl: string | null; primaryColor: string | null; lastAccessedAt: string | null }
export interface Me { maintenance: { message: string } | null; user: { id: string; email: string; name: string; isPlatformAdmin: boolean; preferredLanguage: "en" | "el" }; companies: MeCompany[] }

let me: Me | null = null;
let loading: Promise<void> | null = null;
const ls = new Set<() => void>();

export function refreshMe() {
  loading = apiFetch<Me>("/api/me").then((d) => {
    me = d;
    ls.forEach((l) => l());
  }).catch(() => {}).finally(() => { loading = null; });
  return loading;
}

/** Signed-in user and the companies they can access. */
export function useMe() {
  const v = useSyncExternalStore((l) => (ls.add(l), () => ls.delete(l)), () => me, () => null);
  useEffect(() => {
    if (!me && !loading) refreshMe();
    const onChange = () => refreshMe();
    window.addEventListener("deceler:companies-changed", onChange);
    return () => window.removeEventListener("deceler:companies-changed", onChange);
  }, []);
  return v;
}

export async function signOut() {
  await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  me = null;
  window.location.href = "/login";
}
