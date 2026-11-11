import { z } from "zod";
import { sys } from "@/server/db";
import { clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";

export const GET = handler(async () => {
  await requirePlatformAdmin();
  const flags = await sys("select key, label, description, default_enabled from feature_flags order by position");
  const overrides = await sys("select of.org_id, o.name as company, of.feature_key, of.enabled from org_features of join organizations o on o.id = of.org_id order by o.name");
  return json({ flags, overrides });
});

const Body = z.union([
  z.object({ key: z.string().max(60), defaultEnabled: z.boolean() }),
  z.object({ key: z.string().max(60), orgId: z.string().uuid(), enabled: z.boolean().nullable() }),
]);

export const PUT = handler(async (req) => {
  const admin = await requirePlatformAdmin();
  const v = Body.parse(await req.json());
  if ("defaultEnabled" in v) {
    await sys("update feature_flags set default_enabled = $2 where key = $1", [v.key, v.defaultEnabled]);
  } else if (v.enabled === null) {
    await sys("delete from org_features where org_id = $1 and feature_key = $2", [v.orgId, v.key]);
  } else {
    await sys("insert into org_features (org_id, feature_key, enabled, updated_by) values ($1,$2,$3,$4) on conflict (org_id, feature_key) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()", [v.orgId, v.key, v.enabled, admin.id]);
  }
  await audit({ scope: "platform", action: "platform.feature_changed", actorId: admin.id, orgId: "orgId" in v ? v.orgId : undefined, targetType: "feature", targetId: v.key, metadata: v, ip: clientIp(req) });
  return json({ ok: true });
});
