import type { MetadataRoute } from "next";
import { sys } from "@/server/db";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Public careers pages and published jobs of active companies only. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const orgs = await sys<{ slug: string; created_at: Date }>("select slug, created_at from organizations where status = 'active'");
  const jobs = await sys<{ org_slug: string; slug: string; published_at: Date | null }>(
    "select o.slug as org_slug, j.slug, j.published_at from jobs j join organizations o on o.id = j.org_id where o.status = 'active' and j.status = 'published'");
  return [
    ...orgs.map((o) => ({ url: `${env.appUrl}/careers/${o.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...jobs.map((j) => ({ url: `${env.appUrl}/careers/${j.org_slug}/${j.slug}`, lastModified: j.published_at ?? undefined, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
