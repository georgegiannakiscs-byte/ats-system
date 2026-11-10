import Link from "next/link";
import { BrandMark } from "@/components/shell/brand-mark";
import { careersDict, type CareersLang } from "@/lib/i18n/careers";
import { onColor } from "@/server/careers/data";

type Org = { slug: string; name: string; logoUrl: string | null; branding: Record<string, unknown> };

export function CareersFrame({ org, lang, path, children }: { org: Org; lang: CareersLang; path: string; children: React.ReactNode }) {
  const primary = (org.branding.primaryColor as string) || "#193329";
  const t = careersDict[lang];
  return (
    <div lang={lang} className="flex min-h-dvh flex-col bg-background" style={{ ["--primary" as string]: primary, ["--primary-foreground" as string]: onColor(primary), ["--ring" as string]: `${primary}55` }}>
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4">
          <Link href={`/careers/${org.slug}?lang=${lang}`} className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {org.logoUrl ? <img src={org.logoUrl} alt={org.name} className="h-9 max-w-44 object-contain" /> : <span className="text-lg font-semibold tracking-tight">{org.name}</span>}
          </Link>
          <nav aria-label="Language" className="ml-auto flex gap-1 text-xs">
            {(["en", "el"] as const).map((l) => (
              <Link key={l} href={`${path}?lang=${l}`} hrefLang={l} aria-current={l === lang ? "true" : undefined} className={l === lang ? "rounded px-2 py-1 font-semibold text-foreground" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>
                {l === "en" ? "EN" : "ΕΛ"}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-6">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-2 px-4 text-xs text-muted-foreground">
          {t.poweredBy}
          <Link href="/" aria-label="Déceler" className="inline-flex"><BrandMark height={13} /></Link>
        </div>
      </footer>
    </div>
  );
}

export function langOf(org: { branding: Record<string, unknown> }, q?: string): CareersLang {
  return q === "el" || q === "en" ? q : ((org.branding.careersLanguage as CareersLang) ?? "en");
}
