import "server-only";
import { cache } from "react";
import { sys } from "@/server/db";
import { logoUrl } from "@/server/workspace";

/* Public read model: only active companies and PUBLISHED jobs, only public fields. */
export const getCareersOrg = cache(async (slug: string) => {
  const [o] = await sys<{ id: string; slug: string; name: string; profile: Record<string, string>; branding: Record<string, unknown>; status: string }>(
    "select id, slug, name, profile, branding, status from organizations where slug = $1", [slug]);
  if (!o || o.status !== "active") return null;
  return { id: o.id, slug: o.slug, name: o.name, about: o.profile.about ?? "", website: o.profile.website ?? "", headquarters: o.profile.headquarters ?? "", branding: o.branding, logoUrl: logoUrl(o.id, o.branding), logoDarkUrl: logoUrl(o.id, o.branding, "dark") };
});

const JOB_COLS = "id, slug, title, department, location, workplace, employment_type, contract_type, seniority, salary_min, salary_max, currency, summary, responsibilities, requirements, required_experience, benefits, skills, preferred_skills, screening_questions, published_at, openings";

export const getPublishedJobs = cache(async (orgId: string) =>
  sys(`select ${JOB_COLS} from jobs where org_id = $1 and status = 'published' order by published_at desc nulls last`, [orgId]));

export const getPublishedJob = cache(async (orgId: string, jobSlug: string) => {
  const [j] = await sys(`select ${JOB_COLS} from jobs where org_id = $1 and slug = $2 and status = 'published'`, [orgId, jobSlug]);
  return j ?? null;
});

export async function maxCvMb() {
  const [s] = await sys<{ value: { maxCvMb: number } }>("select value from platform_settings where key = 'storage'");
  return s?.value.maxCvMb ?? 10;
}

/** Picks readable text for a brand colour. */
export function onColor(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#16231d" : "#ffffff";
}
