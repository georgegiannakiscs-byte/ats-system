import Link from "next/link";
import { BrandMark } from "@/components/shell/brand-mark";
import { careersDict, type CareersLang } from "@/lib/i18n/careers";
import { careersThemeVars, cssDeclarations, luminance, resolveCareersTheme, type CareersTheme } from "@/lib/careers-theme";
import { fontFamilyFor } from "@/lib/careers-fonts";
import { cn } from "@/lib/utils";

type Org = { slug: string; name: string; logoUrl: string | null; logoDarkUrl?: string | null; branding: Record<string, unknown>; customBranding?: boolean };

/** The company's careers theme (defaults when the platform has switched custom branding off for it). */
export function careersTheme(org: Org): CareersTheme {
  return resolveCareersTheme(org.branding, org.customBranding ?? true);
}

export function CareersFrame({ org, theme, lang, children }: { org: Org; theme?: CareersTheme; lang: CareersLang; path?: string; children: React.ReactNode; hideLanguage?: boolean }) {
  const t = careersDict[lang];
  const th = theme ?? careersTheme(org);
  // Declared on the document root (not just this wrapper) so dialogs and menus rendered in portals match too.
  // Specificity :root:root beats the app's own :root and .dark tokens.
  const css = `:root:root{${cssDeclarations(careersThemeVars(th, fontFamilyFor))}}`;
  const plate = th.background ? luminance(th.background) < 0.4 : null;
  const logo = th.background && luminance(th.background) < 0.2 && org.logoDarkUrl ? org.logoDarkUrl : org.logoUrl;
  return (
    <div lang={lang} className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4">
          <Link href={`/careers/${org.slug}?lang=${lang}`} className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt={org.name} className="h-9 max-w-44 object-contain" /> : <span className="font-display text-lg font-semibold tracking-tight">{org.name}</span>}
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-6">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-2 px-4 text-xs text-muted-foreground">
          {t.poweredBy}
          {/* The Ulysse wordmark is dark ink: on a dark page it sits on a small cream plate. */}
          <Link href="/" aria-label="Ulysse" className={cn("inline-flex", plate === null ? "dark:rounded dark:bg-[#faf8f3] dark:px-1.5 dark:py-0.5" : plate && "rounded bg-[#faf8f3] px-1.5 py-0.5")}><BrandMark height={13} /></Link>
        </div>
      </footer>
    </div>
  );
}

/** Careers pages are English only (the Greek texts stay in the dictionaries, unused). */
export function langOf(_org: { branding: Record<string, unknown> }, _q?: string): CareersLang {
  return "en";
}
