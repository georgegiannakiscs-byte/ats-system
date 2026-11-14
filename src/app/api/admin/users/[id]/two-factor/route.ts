import { z } from "zod";
import { sysTx } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";

/**
 * Turns off a user's two-step verification when they have lost their phone and their recovery codes.
 * Requires a reason, signs the user out everywhere and is written to the audit log.
 */
export const DELETE = handler(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePlatformAdmin();
  const id = z.string().uuid().parse((await ctx.params).id);
  const { reason } = z.object({ reason: z.string().trim().min(3, "Give a reason").max(300) }).parse(await req.json());
  const updated = await sysTx(async (q) => {
    const rows = await q("update users set totp_secret = null, totp_pending_secret = null, totp_enabled_at = null, totp_last_step = 0, totp_recovery_hashes = '{}' where id = $1 and totp_enabled_at is not null returning id", [id]);
    if (rows.length) await q("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [id]);
    return rows.length;
  });
  if (!updated) throw new HttpError(404, "This user doesn't use two-step verification", "not_enabled");
  await audit({ scope: "platform", action: "user.two_factor_reset_by_admin", actorId: admin.id, targetType: "user", targetId: id, metadata: { reason }, ip: clientIp(req) });
  return json({ ok: true });
});
