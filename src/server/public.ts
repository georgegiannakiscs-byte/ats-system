import "server-only";
import { sys } from "./db";
import { HttpError } from "./http";
import { featureEnabled } from "./org";
import { CV_TEMPLATES, type CvTemplate } from "@/lib/cv/schema";

/** Resolves a published job on an active company's careers page (public context). */
export async function publicJob(orgSlug: string, jobSlug: string) {
  const [j] = await sys<{ id: string; org_id: string; title: string; recruiter_id: string | null; org_name: string; org_status: string; status: string; cv_settings: Record<string, unknown>; branding: Record<string, unknown> }>(
    `select j.id, j.org_id, j.title, j.recruiter_id, o.name as org_name, o.status as org_status, j.status, o.cv_settings, o.branding
     from jobs j join organizations o on o.id = j.org_id where o.slug = $1 and j.slug = $2`,
    [String(orgSlug).slice(0, 60), String(jobSlug).slice(0, 120)],
  );
  if (!j || j.org_status !== "active" || j.status !== "published") throw new HttpError(404, "This position is no longer accepting applications", "job_closed");
  return j;
}

/** CV templates available to a company: platform-enabled ∩ company-enabled. */
export async function allowedTemplates(cvSettings: Record<string, unknown>): Promise<CvTemplate[]> {
  const [p] = await sys<{ value: { enabled: string[] } }>("select value from platform_settings where key = 'cv_templates'");
  const platform = (p?.value.enabled ?? [...CV_TEMPLATES]).filter((t): t is CvTemplate => (CV_TEMPLATES as readonly string[]).includes(t));
  const company = Array.isArray(cvSettings.templates) ? (cvSettings.templates as string[]) : null;
  const list = company ? platform.filter((t) => company.includes(t)) : platform;
  return list.length ? list : ["minimal"];
}

export async function assertCvBuilder(orgId: string) {
  if (!(await featureEnabled(orgId, "cv_builder"))) throw new HttpError(403, "The CV Builder isn't available for this company", "feature_disabled");
}
