import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  return {
    // Company logos and cover images (link previews on LinkedIn, Google Jobs) and the LinkedIn job feed live under /api/public
    // and must stay reachable for crawlers; everything else under /api stays off-limits.
    rules: [{ userAgent: "*", allow: ["/careers/", "/talent", "/api/public/logo/", "/api/public/cover/", "/api/public/linkedin-jobs"], disallow: ["/app", "/admin", "/api/", "/invite/", "/reset/"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
