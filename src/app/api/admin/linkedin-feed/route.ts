import { sys } from "@/server/db";
import { clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";
import { randomToken } from "@/server/security";
import { applyUrlLooksAccepted, buildLinkedInFeed, feedKey, feedUrl } from "@/server/linkedin-feed";

/** Feed address and what's in it (job titles and reasons only; no candidate data). */
export const GET = handler(async () => {
  await requirePlatformAdmin();
  const { report } = await buildLinkedInFeed();
  const companies = await sys<{ name: string; enabled: boolean; has_id: boolean; has_email: boolean }>(
    `select name, coalesce((linkedin_feed->>'enabled')::boolean, false) enabled, coalesce(linkedin_feed->>'companyId', '') <> '' has_id,
            coalesce(linkedin_feed->>'posterEmail', '') <> '' has_email from organizations where status = 'active' order by name`);
  return json({ url: feedUrl(await feedKey()), applyUrlOk: applyUrlLooksAccepted(), report, companies }, { headers: { "Cache-Control": "private, no-store" } });
});

/** New secret key: the old feed URL stops working (give LinkedIn the new one). */
export const POST = handler(async (req) => {
  const admin = await requirePlatformAdmin();
  const key = randomToken(24).replace(/[^a-zA-Z0-9]/g, "x");
  await sys("insert into platform_settings (key, value, updated_by, updated_at) values ('linkedin_feed', $1, $2, now()) on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()", [JSON.stringify({ key }), admin.id]);
  await audit({ scope: "platform", action: "platform.linkedin_feed_key_rotated", actorId: admin.id, ip: clientIp(req) });
  return json({ url: feedUrl(key) });
});
