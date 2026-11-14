import { z } from "zod";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit } from "@/server/security";
import { createSession } from "@/server/auth";
import { audit } from "@/server/org";
import { checkSecondFactor, readMfaTicket, twoFactorStatus } from "@/server/two-factor";

const Body = z.object({ ticket: z.string().min(20).max(2000), code: z.string().trim().min(6).max(40) });

/** Second step of sign-in: an authenticator code or a one-time recovery code. */
export const POST = handler(async (req) => {
  const ip = clientIp(req);
  const v = Body.parse(await req.json());
  const userId = await readMfaTicket(v.ticket);
  if (!rateLimit(`mfa:${userId}`, 10, 15 * 60_000).ok || !rateLimit(`mfa-ip:${ip}`, 30, 15 * 60_000).ok)
    throw new HttpError(429, "Too many attempts. Please wait a few minutes.", "rate_limited");
  const kind = await checkSecondFactor(userId, v.code);
  if (!kind) {
    await audit({ scope: "platform", action: "user.two_factor_failed", actorId: userId, targetType: "user", targetId: userId, ip });
    throw new HttpError(401, "That code isn't valid. Check your authenticator app and try again.", "invalid_code");
  }
  await createSession(userId, req);
  if (kind === "recovery") await audit({ scope: "platform", action: "user.recovery_code_used", actorId: userId, targetType: "user", targetId: userId, ip });
  return json({ ok: true, recoveryCodesLeft: kind === "recovery" ? (await twoFactorStatus(userId)).recoveryCodesLeft : undefined });
});
