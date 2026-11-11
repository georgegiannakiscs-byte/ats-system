import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";

const Patch = z.object({ status: z.enum(["active", "deactivated"]).optional(), isPlatformAdmin: z.boolean().optional() });

export const PATCH = handler(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePlatformAdmin();
  const id = z.string().uuid().parse((await ctx.params).id);
  const v = Patch.parse(await req.json());
  if (id === admin.id && (v.status === "deactivated" || v.isPlatformAdmin === false)) throw new HttpError(400, "You can't deactivate or demote your own account", "self");
  const rows = await sys("update users set status = coalesce($2, status), is_platform_admin = coalesce($3, is_platform_admin) where id = $1 returning id", [id, v.status ?? null, v.isPlatformAdmin ?? null]);
  if (!rows.length) throw new HttpError(404, "User not found", "not_found");
  if (v.status === "deactivated") await sys("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [id]);
  await audit({ scope: "platform", action: v.status === "deactivated" ? "user.deactivated" : v.status === "active" ? "user.reactivated" : "user.platform_role_changed", actorId: admin.id, targetType: "user", targetId: id, metadata: v, ip: clientIp(req) });
  return json({ ok: true });
});
