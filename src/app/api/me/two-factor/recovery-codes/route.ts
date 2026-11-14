import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { audit } from "@/server/org";
import { checkSecondFactor } from "@/server/two-factor";
import { hashRecoveryCode, newRecoveryCodes } from "@/server/totp";
import { rateLimit } from "@/server/security";

const Body = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your app") });

/** New set of recovery codes (the old ones stop working). Needs a current authenticator code. */
export const POST = handler(async (req) => {
  const user = await requireUser();
  if (!rateLimit(`mfa-codes:${user.id}`, 10, 15 * 60_000).ok) throw new HttpError(429, "Too many attempts. Please wait a few minutes.", "rate_limited");
  const v = Body.parse(await req.json());
  if ((await checkSecondFactor(user.id, v.code, { allowRecovery: false })) !== "totp") throw new HttpError(400, "That code isn't valid", "invalid_code");
  const codes = newRecoveryCodes();
  await sys("update users set totp_recovery_hashes = $2 where id = $1", [user.id, codes.map(hashRecoveryCode)]);
  await audit({ scope: "platform", action: "user.recovery_codes_regenerated", actorId: user.id, targetType: "user", targetId: user.id, ip: clientIp(req) });
  return json({ recoveryCodes: codes });
});
