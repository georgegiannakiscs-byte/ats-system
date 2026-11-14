import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { audit } from "@/server/org";
import { confirmPassword } from "@/server/reauth";
import { checkSecondFactor } from "@/server/two-factor";

const Body = z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(40) });

/** Turning it off needs both the password and a current code (or a recovery code). */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const v = Body.parse(await req.json());
  await confirmPassword(user.id, v.password);
  if (!(await checkSecondFactor(user.id, v.code))) throw new HttpError(400, "That code isn't valid", "invalid_code");
  await sys("update users set totp_secret = null, totp_pending_secret = null, totp_enabled_at = null, totp_last_step = 0, totp_recovery_hashes = '{}' where id = $1", [user.id]);
  await audit({ scope: "platform", action: "user.two_factor_disabled", actorId: user.id, targetType: "user", targetId: user.id, ip: clientIp(req) });
  return json({ ok: true });
});
