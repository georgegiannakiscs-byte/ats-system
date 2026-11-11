import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { env } from "@/server/env";
import { maxCvMb } from "@/server/careers/data";
import { allowedTemplates } from "@/server/public";
import { BrandMark } from "@/components/shell/brand-mark";
import { TalentForm } from "@/components/talent/talent-form";
import { talentDict, type TalentLang } from "@/lib/i18n/talent";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const langOf = (q?: string): TalentLang => (q === "el" ? "el" : "en");

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = talentDict[langOf((await searchParams).lang)];
  return {
    title: { absolute: t.metaTitle },
    description: t.metaDescription,
    alternates: { canonical: `${env.appUrl}/talent`, languages: { en: `${env.appUrl}/talent?lang=en`, el: `${env.appUrl}/talent?lang=el` } },
    openGraph: { title: t.metaTitle, description: t.metaDescription, url: `${env.appUrl}/talent`, type: "website", siteName: "Ulysse" },
  };
}

/** Public landing page for job seekers (e.g. from LinkedIn). Submissions go to Admin → Talent leads. */
export default async function TalentPage({ searchParams }: Props) {
  const sp = await searchParams;
  const lang = langOf(sp.lang);
  const t = talentDict[lang];
  const [mb, templates] = await Promise.all([maxCvMb(), allowedTemplates({})]);
  // Keep tracking parameters when switching language.
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k.startsWith("utm_") && v) as [string, string][]);
  const href = (l: TalentLang) => { const p = new URLSearchParams(keep); p.set("lang", l); return `/talent?${p}`; };

  return (
    <div lang={lang} className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link href={href(lang)} aria-label="Ulysse" className="inline-flex"><BrandMark height={24} /></Link>
          <nav aria-label="Language" className="ml-auto flex gap-1 text-xs">
            {(["en", "el"] as const).map((l) => (
              <Link key={l} href={href(l)} hrefLang={l} aria-current={l === lang ? "true" : undefined} className={l === lang ? "rounded px-2 py-1 font-semibold text-foreground" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>
                {l === "en" ? "EN" : "ΕΛ"}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 lg:grid-cols-[1fr_420px] lg:py-16">
          <section className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.eyebrow}</p>
            <h1 className="mt-3 font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl">{t.title}<span className="text-signal">.</span></h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{t.lead}</p>
            <ul className="mt-8 space-y-3">
              {t.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[15px]"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>{p}</li>
              ))}
            </ul>
          </section>
          <aside id="form" className="lg:sticky lg:top-6 lg:self-start">
            <Suspense><TalentForm lang={lang} maxMb={mb} templates={templates} /></Suspense>
          </aside>
        </div>
      </main>
      <footer className="border-t border-border py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 text-xs text-muted-foreground">© Ulysse</div>
      </footer>
    </div>
  );
}
