"use client";
import * as React from "react";
import { BRAND } from "@/config/brand";

export interface Crumb { label: string; href?: string }
interface PageMeta { title: string; crumbs: Crumb[] }

const Ctx = React.createContext<{ meta: PageMeta; setMeta: (m: PageMeta) => void } | null>(null);

export function PageMetaProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = React.useState<PageMeta>({ title: "", crumbs: [] });
  const value = React.useMemo(() => ({ meta, setMeta }), [meta]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePageMetaValue() {
  return React.useContext(Ctx)!.meta;
}

/** Pages declare their title and breadcrumbs; the top bar renders them. */
export function usePageMeta(title: string, crumbs: Crumb[] = []) {
  const ctx = React.useContext(Ctx)!;
  const key = JSON.stringify([title, crumbs]);
  React.useEffect(() => {
    ctx.setMeta({ title, crumbs });
    document.title = title ? `${title} · ${BRAND.name}` : BRAND.name;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
