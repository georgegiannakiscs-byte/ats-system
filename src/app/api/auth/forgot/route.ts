import { z } from "zod";
import { sys } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit, randomToken, sha256 } from "@/server/security";
import { audit } from "@/server/org";
import { mailConfigured, sendMail } from "@/server/mail";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/**
 * "Forgot password": emails a one-time link (1 hour). The answer is the same whether or not the
 * account exists, so it can't be used to find out who has one. Two-step verification still applies
 * after the reset.
 */
export const POST = handler(async (req) => {
  const ip = clientIp(req);
  const v = Body.parse(await req.json());
  if (!rateLimit(`forgot:${ip}`, 10, 15 * 60_000).ok || !rateLimit(`forgot:${v.email}`, 3, 60 * 60_000).ok)
    throw new HttpError(429, "Too many requests. Please wait a few minutes.", "rate_limited");
  if (!mailConfigured()) return json({ ok: true, delivery: "not_configured" });
  const [u] = await sys<{ id: string; name: string; status: string }>("select id, name, status from users where lower(email) = $1", [v.email]);
  if (u && u.status === "active") {
    const token = randomToken();
    await sys("update password_resets set used_at = now() where user_id = $1 and used_at is null", [u.id]);
    await sys("insert into password_resets (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')", [u.id, sha256(token)]);
    await sendMail(null, v.email, "Reset your Ulysse password",
      `Hi ${u.name.split(" ")[0]},\n\nSomeone (hopefully you) asked to reset the password of your Ulysse account. Choose a new one here:\n\n${env.appUrl}/reset/${token}\n\nThe link works once and expires in 1 hour. If you didn't ask for this, ignore this email: your password stays the same.\n\nUlysse`,
      "password_reset");
    await audit({ scope: "platform", action: "user.password_reset_requested", actorId: u.id, targetType: "user", targetId: u.id, ip });
  }
  return json({ ok: true, delivery: "sent_if_exists" });
});
