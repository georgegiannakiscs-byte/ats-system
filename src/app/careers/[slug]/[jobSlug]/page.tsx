import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Clock, MapPin } from "lucide-react";
import { env } from "@/server/env";
import { getCareersOrg, getPublishedJob, maxCvMb } from "@/server/careers/data";
import { CareersFrame, langOf } from "@/components/careers/frame";
import { ApplicationForm } from "@/components/careers/application-form";
import { careersDict } from "@/lib/i18n/careers";
import { sys } from "@/server/db";
import { featureEnabled } from "@/server/org";
import { allowedTemplates } from "@/server/public";
import { aiUnavailableReason } from "@/server/ai/claude";
import type { CvTemplate } from "@/lib/cv/schema";

/** CV Builder options for this company (null when the feature is off). */
async function builderConfig(orgId: string) {
  if (!(await featureEnabled(orgId, "cv_builder"))) return null;
  const [o] = await sys<{ cv_settings: { defaultTemplate?: CvTemplate } }>("select cv_settings from organizations where id = $1", [orgId]);
  const templates = await allowedTemplates(o?.cv_settings ?? {});
  const def = o?.cv_settings.defaultTemplate;
  return { templates, defaultTemplate: def && templates.includes(def) ? def : templates[0], aiSummary: (await aiUnavailableReason(orgId, "cv_summary")) === null };
}

type Props = { params: Promise<{ slug: string; jobSlug: string }>; searchParams: Promise<{ lang?: string }> };

async function load(p: Props["params"]) {
  const { slug, jobSlug } = await p;
  const org = await getCareersOrg(slug);
  if (!org) return null;
  const job = await getPublishedJob(org.id, jobSlug);
  return job ? { org, job } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load(params);
  if (!d) return { title: "Position not found", robots: { index: false } };
  const url = `${env.appUrl}/careers/${d.org.slug}/${d.job.slug}`;
  return {
    title: { absolute: `${d.job.title} · ${d.org.name}` },
    description: (d.job.summary as string)?.slice(0, 160) || `${d.job.title} at ${d.org.name}`,
    alternates: { canonical: url },
    openGraph: { title: `${d.job.title} - ${d.org.name}`, description: (d.job.summary as string)?.slice(0, 200), url, type: "website", images: d.org.logoUrl ? [`${env.appUrl}${d.org.logoUrl}`] : undefined },
  };
}

const lines = (s: string) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

export default async function JobPage({ params, searchParams }: Props) {
  const d = await load(params);
  if (!d) notFound();
  const { org, job } = d;
  const lang = langOf(org, (await searchParams).lang);
  const t = careersDict[lang];
  const mb = await maxCvMb();
  const builder = await builderConfig(org.id);
  const salary = job.salary_min || job.salary_max ? new Intl.NumberFormat(lang === "el" ? "el-GR" : "en-GB", { style: "currency", currency: job.currency, maximumFractionDigits: 0 }) : null;

  // Google JobPosting structured data (only for published jobs with the required fields).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: [job.summary, ...lines(job.responsibilities), ...lines(job.requirements)].filter(Boolean).join("\n") || job.title,
    datePosted: job.published_at ? new Date(job.published_at).toISOString().slice(0, 10) : undefined,
    employmentType: { "Full-time": "FULL_TIME", "Part-time": "PART_TIME", Contract: "CONTRACTOR", Internship: "INTERN" }[job.employment_type as string] ?? "OTHER",
    hiringOrganization: { "@type": "Organization", name: org.name, sameAs: org.website || undefined, logo: org.logoUrl ? `${env.appUrl}${org.logoUrl}` : undefined },
    ...(job.workplace === "Remote" ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: job.location || "EU" } } : { jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location || org.headquarters || undefined } } }),
    ...(job.salary_min || job.salary_max ? { baseSalary: { "@type": "MonetaryAmount", currency: job.currency, value: { "@type": "QuantitativeValue", minValue: job.salary_min ?? undefined, maxValue: job.salary_max ?? undefined, unitText: "YEAR" } } } : {}),
    directApply: true,
  };


  return (
    <CareersFrame org={org} lang={lang} path={`/careers/${org.slug}/${job.slug}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto grid max-w-4xl gap-10 px-4 py-10 lg:grid-cols-[1fr_380px]">
        <article className="min-w-0">
          <Link href={`/careers/${org.slug}?lang=${lang}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />{t.backToJobs}</Link>
          <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight">{job.title}</h1>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {job.location && <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{job.location}</span>}
            <span className="inline-flex items-center gap-1"><Briefcase className="size-4" />{job.workplace} · {job.employment_type}</span>
            {job.department && <span>{job.department}</span>}
            {job.published_at && <span className="inline-flex items-center gap-1"><Clock className="size-4" />{t.posted} {new Date(job.published_at).toLocaleDateString(lang === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "long" })}</span>}
          </p>
          {salary && <p className="mt-2 text-sm"><span className="text-muted-foreground">{t.salary}: </span>{job.salary_min ? salary.format(job.salary_min) : ""}{job.salary_min && job.salary_max ? " – " : ""}{job.salary_max ? salary.format(job.salary_max) : ""}</p>}
          <Section title={t.about} text={job.summary} />
          <Section title={t.responsibilities} items={lines(job.responsibilities)} />
          <Section title={t.requirements} items={lines(job.requirements)} />
          <Section title={t.niceToHave} items={lines(job.nice_to_have)} />
          <Section title={t.experience} text={job.required_experience} />
          {(job.skills?.length > 0 || job.preferred_skills?.length > 0) && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.skills}</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">{job.skills.map((s: string) => <span key={s} className="rounded-md border border-border bg-surface px-2 py-0.5 text-sm">{s}</span>)}</div>
              {job.preferred_skills?.length > 0 && <p className="mt-3 text-sm text-muted-foreground">{t.niceToHave}: {job.preferred_skills.join(", ")}</p>}
            </section>
          )}
          <Section title={t.benefits} items={lines(job.benefits)} />
        </article>
        <aside id="apply" className="lg:sticky lg:top-6 lg:self-start">
          <Suspense><ApplicationForm lang={lang} orgSlug={org.slug} jobSlug={job.slug} jobTitle={job.title} companyName={org.name} logoUrl={org.logoUrl} maxMb={mb} questions={job.screening_questions ?? []} builder={builder} jobSkills={[...(job.skills ?? []), ...(job.preferred_skills ?? [])]} /></Suspense>
        </aside>
      </div>
    </CareersFrame>
  );
}

function Section({ title, items, text }: { title: string; items?: string[]; text?: string }) {
  if (!items?.length && !text) return null;
  return (
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {text && <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/85">{text}</p>}
        {items && items.length > 0 && <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-foreground/85 marker:text-subtle-foreground">{items.map((i) => <li key={i}>{i}</li>)}</ul>}
      </section>
  );
}
