import crypto from "node:crypto";
import { buildLinkedInFeed, feedKey } from "@/server/linkedin-feed";
import { clientIp } from "@/server/http";
import { rateLimit } from "@/server/security";

/**
 * LinkedIn Basic Jobs XML feed, downloaded by LinkedIn. Served only with the secret key from
 * Admin → Integrations, because each job carries the company's poster email.
 */
export async function GET(req: Request) {
  if (!rateLimit(`li-feed:${clientIp(req)}`, 120, 60 * 60_000).ok) return new Response("Too many requests", { status: 429 });
  const given = new URL(req.url).searchParams.get("key") ?? "";
  const key = await feedKey();
  const ok = key.length > 0 && given.length === key.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
  if (!ok) return new Response("Not found", { status: 404 });
  const { xml } = await buildLinkedInFeed();
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" },
  });
}
