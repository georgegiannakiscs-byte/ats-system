import { z } from "zod";
import { cookies } from "next/headers";
import { sys, sysTx } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { SESSION_COOKIE, requireUser } from "@/server/auth";
import { audit } from "@/server/org";
import { rateLimit, sha256 } from "@/server/security";
import { decryptSecret, hashRecoveryCode, newRecoveryCodes, verifyTotp } from "@/server/totp";

const Body = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

/** Step 2: confirm the scanned secret with a first code. Returns the recovery codes once. */
export const POST = handler(async (req) => {
  const user = await requireUser();
  if (!rateLimit(`mfa-enable:${user.id}`, 10, 15 * 60_000).ok) throw new HttpError(429, "Too many attempts. Please wait a few minutes.", "rate_limited");
  const v = Body.parse(await req.json());
  const [r] = await sys<{ totp_pending_secret: string | null; totp_enabled_at: Date | null }>("select totp_pending_secret, totp_enabled_at from users where id = $1", [user.id]);
  if (r?.totp_enabled_at) throw new HttpError(409, "Two-step verification is already on", "already_enabled");
  const secret = r?.totp_pending_secret ? decryptSecret(r.totp_pending_secret) : null;
  if (!secret) throw new HttpError(400, "Start the set-up again", "no_pending_setup");
  const step = verifyTotp(secret, v.code);
  if (step == null) throw new HttpError(400, "That code isn't valid. Check the time on your phone and try the newest code.", "invalid_code");
  const codes = newRecoveryCodes();
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await sysTx(async (q) => {
    await q("update users set totp_secret = totp_pending_secret, totp_pending_secret = null, totp_enabled_at = now(), totp_last_step = $2, totp_recovery_hashes = $3 where id = $1",
      [user.id, step, codes.map(hashRecoveryCode)]);
    // Sign out everywhere else: other sessions were created without the second step.
    await q("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and token_hash <> $2", [user.id, sha256(token)]);
  });
  await audit({ scope: "platform", action: "user.two_factor_enabled", actorId: user.id, targetType: "user", targetId: user.id, ip: clientIp(req) });
  return json({ recoveryCodes: codes });
});
