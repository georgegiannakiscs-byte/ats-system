import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/careers/", "/talent"], disallow: ["/app", "/admin", "/api/", "/invite/", "/reset/"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
