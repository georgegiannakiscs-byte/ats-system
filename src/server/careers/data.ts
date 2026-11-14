import "server-only";
import { cache } from "react";
import { sys } from "@/server/db";
import { logoUrl } from "@/server/workspace";
import { featureEnabled } from "@/server/org";

/* Public read model: only active companies and PUBLISHED jobs, only public fields. */
export const getCareersOrg = cache(async (slug: string) => {
  const [o] = await sys<{ id: string; slug: string; name: string; profile: Record<string, string>; branding: Record<string, unknown>; status: string }>(
    "select id, slug, name, profile, branding, status from organizations where slug = $1", [slug]);
  if (!o || o.status !== "active") return null;
  const customBranding = await featureEnabled(o.id, "custom_branding");
  return { id: o.id, slug: o.slug, name: o.name, about: o.profile.about ?? "", website: o.profile.website ?? "", headquarters: o.profile.headquarters ?? "", branding: o.branding, customBranding, logoUrl: logoUrl(o.id, o.branding), logoDarkUrl: logoUrl(o.id, o.branding, "dark") };
});

const JOB_COLS = "id, slug, title, department, location, workplace, employment_type, contract_type, seniority, salary_min, salary_max, currency, summary, responsibilities, requirements, nice_to_have, required_experience, benefits, skills, preferred_skills, screening_questions, published_at, openings";

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

export { onColor } from "@/lib/careers-theme";
