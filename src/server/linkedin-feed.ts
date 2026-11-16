import "server-only";
import crypto from "node:crypto";
import { sys } from "./db";
import { env } from "./env";

/*
 * LinkedIn "Basic Jobs" XML feed (https://learn.microsoft.com/linkedin/talent/job-postings/xml-feeds-development-guide).
 * LinkedIn downloads the feed and lists the jobs for free in LinkedIn Jobs, under each company's page;
 * "Apply" sends candidates to the job page in Ulysse. Only published jobs of active companies that
 * opted in (Settings → Integrations → LinkedIn Jobs) and have a LinkedIn Company ID and a poster email.
 */

export interface LinkedInFeedSettings { enabled?: boolean; companyId?: string; posterEmail?: string; country?: string }

type Row = {
  id: string; slug: string; title: string; location: string; workplace: string; employment_type: string; seniority: string;
  summary: string; responsibilities: string; requirements: string; nice_to_have: string; required_experience: string; benefits: string;
  skills: string[]; salary_min: number | null; salary_max: number | null; currency: string; published_at: Date | null;
  org_name: string; org_slug: string; feed: LinkedInFeedSettings;
};

const WORKPLACE: Record<string, string> = { "On-site": "On-site", Hybrid: "Hybrid", Remote: "Remote" };
const JOB_TYPE: Record<string, string> = { "Full-time": "FULL_TIME", "Part-time": "PART_TIME", Contract: "CONTRACT", Internship: "INTERNSHIP" };
const LEVEL: Record<string, string> = { Junior: "ENTRY_LEVEL", "Mid-level": "ASSOCIATE", Senior: "MID_SENIOR_LEVEL", Lead: "MID_SENIOR_LEVEL", Principal: "MID_SENIOR_LEVEL" };
const SUPPORTED_CURRENCIES = new Set(["EUR", "GBP", "CHF", "USD"]);

/** Text for inside CDATA: no "<" or ">" (LinkedIn reads HTML there and doesn't accept escaped entities), no CDATA terminator. */
const clean = (s: string) => (s ?? "").replace(/[<>]/g, "").replace(/\]\]/g, "] ]").trim();
const cdata = (s: string | number) => `<![CDATA[${typeof s === "number" ? s : clean(s)}]]>`;
/** For HTML we built ourselves from clean() text: keep the tags, only guard the CDATA terminator. */
const htmlCdata = (html: string) => `<![CDATA[${html.replace(/\]\]>/g, "] ]>")}]]>`;
const lines = (s: string) => (s ?? "").split("\n").map((l) => clean(l)).filter(Boolean);
const mmddyyyy = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** Job description as the small HTML subset LinkedIn accepts (p, strong, ul, li). */
export function descriptionHtml(j: Pick<Row, "summary" | "responsibilities" | "requirements" | "nice_to_have" | "required_experience" | "benefits">) {
  const parts: string[] = [];
  const para = (t: string) => lines(t).map((l) => `<p>${l}</p>`).join("");
  const list = (title: string, t: string) => { const items = lines(t); if (items.length) parts.push(`<p><strong>${title}</strong></p><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`); };
  if (clean(j.summary)) parts.push(para(j.summary));
  list("Responsibilities", j.responsibilities);
  list("Requirements", j.requirements);
  list("Nice to have", j.nice_to_have);
  if (clean(j.required_experience)) parts.push(`<p><strong>Experience:</strong> ${clean(j.required_experience)}</p>`);
  list("Benefits", j.benefits);
  return parts.join("");
}

const plainLength = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
const partnerJobId = (id: string) => (id.length <= 40 ? id : crypto.createHash("sha256").update(id).digest("hex").slice(0, 40));

export function applyUrl(orgSlug: string, jobSlug: string) {
  const p = new URLSearchParams({ utm_source: "linkedin", utm_medium: "jobs", utm_campaign: jobSlug });
  return `${env.appUrl}/careers/${encodeURIComponent(orgSlug)}/${encodeURIComponent(jobSlug)}?${p}`;
}

export interface FeedReport { included: { company: string; job: string }[]; skipped: { company: string; job: string; reason: string }[] }

export async function buildLinkedInFeed(): Promise<{ xml: string; report: FeedReport }> {
  const rows = await sys<Row>(
    `select j.id, j.slug, j.title, j.location, j.workplace, j.employment_type, j.seniority, j.summary, j.responsibilities, j.requirements,
            j.nice_to_have, j.required_experience, j.benefits, j.skills, j.salary_min, j.salary_max, j.currency, j.published_at,
            o.name as org_name, o.slug as org_slug, o.linkedin_feed as feed
     from jobs j join organizations o on o.id = j.org_id
     left join feature_flags f on f.key = 'linkedin' left join org_features of on of.org_id = o.id and of.feature_key = 'linkedin'
     where j.status = 'published' and o.status = 'active' and (o.linkedin_feed->>'enabled')::boolean is true
       and coalesce(of.enabled, f.default_enabled, true)
     order by o.name, j.published_at desc nulls last`);
  const report: FeedReport = { included: [], skipped: [] };
  const jobs: string[] = [];
  for (const r of rows) {
    const skip = (reason: string) => report.skipped.push({ company: r.org_name, job: r.title, reason });
    const companyId = (r.feed.companyId ?? "").trim();
    const posterEmail = (r.feed.posterEmail ?? "").trim();
    if (!/^\d{1,20}$/.test(companyId)) { skip("No LinkedIn Company ID in the company's settings"); continue; }
    if (!posterEmail) { skip("No poster email in the company's settings"); continue; }
    const desc = descriptionHtml(r);
    if (plainLength(desc) < 100) { skip("Description shorter than 100 characters (LinkedIn's minimum)"); continue; }
    const city = clean((r.location ?? "").split(",")[0]);
    const country = /^[A-Z]{2}$/.test(r.feed.country ?? "") ? r.feed.country! : "GR";
    if (!city && r.workplace !== "Remote") { skip("No location (LinkedIn needs a city for on-site and hybrid jobs)"); continue; }
    const x: string[] = [
      `<partnerJobId>${cdata(partnerJobId(r.id))}</partnerJobId>`,
      `<company>${cdata(r.org_name)}</company>`,
      `<title>${cdata(r.title)}</title>`,
      `<description>${htmlCdata(desc)}</description>`,
      `<applyUrl>${cdata(applyUrl(r.org_slug, r.slug))}</applyUrl>`,
      `<companyId>${cdata(companyId)}</companyId>`,
      ...(city ? [`<city>${cdata(city)}</city>`] : []),
      `<country>${cdata(country)}</country>`,
      ...(WORKPLACE[r.workplace] ? [`<workplaceTypes>${cdata(WORKPLACE[r.workplace])}</workplaceTypes>`] : []),
      ...(JOB_TYPE[r.employment_type] ? [`<jobtype>${cdata(JOB_TYPE[r.employment_type])}</jobtype>`] : []),
      `<experienceLevel>${cdata(r.employment_type === "Internship" ? "INTERNSHIP" : LEVEL[r.seniority] ?? "NOT_APPLICABLE")}</experienceLevel>`,
      ...((r.skills ?? []).length ? [`<skills>${r.skills.slice(0, 10).map((s) => `<skill>${cdata(s)}</skill>`).join("")}</skills>`] : []),
      ...((r.salary_min || r.salary_max) && SUPPORTED_CURRENCIES.has(r.currency)
        ? [`<salaries><salary>${r.salary_max ? `<highEnd><amount>${cdata(r.salary_max)}</amount><currencyCode>${cdata(r.currency)}</currencyCode></highEnd>` : ""}${r.salary_min ? `<lowEnd><amount>${cdata(r.salary_min)}</amount><currencyCode>${cdata(r.currency)}</currencyCode></lowEnd>` : ""}<period>${cdata("YEARLY")}</period><type>${cdata("BASE_SALARY")}</type></salary></salaries>`]
        : []),
      ...(r.published_at ? [`<listDate>${cdata(mmddyyyy(new Date(r.published_at)))}</listDate>`] : []),
      `<posterEmail>${cdata(posterEmail)}</posterEmail>`,
    ];
    jobs.push(`  <job>\n    ${x.join("\n    ")}\n  </job>`);
    report.included.push({ company: r.org_name, job: r.title });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <publisherUrl>${cdata(env.appUrl)}</publisherUrl>
  <publisher>${cdata("Ulysse")}</publisher>
  <expectedJobCount>${cdata(jobs.length)}</expectedJobCount>
${jobs.join("\n")}
</source>
`;
  return { xml, report };
}

export async function feedKey() {
  const [s] = await sys<{ value: { key?: string } }>("select value from platform_settings where key = 'linkedin_feed'");
  return s?.value.key ?? "";
}

export const feedUrl = (key: string) => `${env.appUrl}/api/public/linkedin-jobs?key=${key}`;

/** LinkedIn's spec asks for apply URLs that start with https://www. */
export const applyUrlLooksAccepted = () => /^https:\/\/www\./.test(env.appUrl);
