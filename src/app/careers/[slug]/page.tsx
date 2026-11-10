import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { env } from "@/server/env";
import { getCareersOrg, getPublishedJobs } from "@/server/careers/data";
import { CareersFrame, langOf } from "@/components/careers/frame";
import { JobFilters } from "@/components/careers/job-filters";
import { careersDict } from "@/lib/i18n/careers";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string; q?: string; location?: string; type?: string; department?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const org = await getCareersOrg((await params).slug);
  if (!org) return { title: "Not found" };
  const title = `Careers at ${org.name}`;
  return {
    title: { absolute: title },
    description: (org.branding.careersIntro as string) || org.about || `Open positions at ${org.name}.`,
    alternates: { canonical: `${env.appUrl}/careers/${org.slug}`, languages: { en: `${env.appUrl}/careers/${org.slug}?lang=en`, el: `${env.appUrl}/careers/${org.slug}?lang=el` } },
    openGraph: { title, type: "website", url: `${env.appUrl}/careers/${org.slug}`, images: org.logoUrl ? [`${env.appUrl}${org.logoUrl}`] : undefined },
  };
}

export default async function CareersPage({ params, searchParams }: Props) {
  const org = await getCareersOrg((await params).slug);
  if (!org) notFound();
  const sp = await searchParams;
  const lang = langOf(org, sp.lang);
  const t = careersDict[lang];
  const all = await getPublishedJobs(org.id);
  const q = (sp.q ?? "").toLowerCase();
  const jobs = all.filter((j) => (!q || `${j.title} ${j.department} ${j.location}`.toLowerCase().includes(q)) && (!sp.location || j.location === sp.location) && (!sp.type || j.employment_type === sp.type) && (!sp.department || j.department === sp.department));
  const benefits = (org.branding.benefits as string[] | undefined) ?? [];
  const grid = org.branding.careersLayout === "grid";
  return (
    <CareersFrame org={org} lang={lang} path={`/careers/${org.slug}`}>
      <section className="mx-auto max-w-4xl px-4 pb-6 pt-12">
        <h1 className="font-display text-4xl tracking-tight sm:text-5xl">{(org.branding.careersHeadline as string) || (lang === "el" ? `Καριέρα στην ${org.name}` : `Careers at ${org.name}`)}</h1>
        {((org.branding.careersIntro as string) || org.about) && <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-relaxed text-foreground/80">{(org.branding.careersIntro as string) || org.about}</p>}
        {benefits.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-2">{benefits.map((b) => <li key={b} className="rounded-full border border-border bg-surface px-3 py-1 text-sm">{b}</li>)}</ul>
        )}
      </section>
      <section className="mx-auto max-w-4xl px-4 pb-16" aria-labelledby="open-positions">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="open-positions" className="text-lg font-semibold">{t.openPositions} <span className="tabular text-muted-foreground">{all.length}</span></h2>
        </div>
        {all.length > 1 && <Suspense><JobFilters lang={lang} jobs={all.map((j) => ({ location: j.location, type: j.employment_type, department: j.department }))} current={{ q: sp.q ?? "", location: sp.location ?? "", type: sp.type ?? "", department: sp.department ?? "" }} /></Suspense>}
        {jobs.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">{t.noJobs}</p>
        ) : (
          <ul className={grid ? "grid gap-3 sm:grid-cols-2" : "divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface"}>
            {jobs.map((j) => (
              <li key={j.id} className={grid ? "rounded-xl border border-border bg-surface" : ""}>
                <Link href={`/careers/${org.slug}/${j.slug}?lang=${lang}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/50">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium group-hover:underline">{j.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      {j.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{j.location}</span>}
                      <span>{j.workplace}</span><span>{j.employment_type}</span>{j.department && <span>{j.department}</span>}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CareersFrame>
  );
}
