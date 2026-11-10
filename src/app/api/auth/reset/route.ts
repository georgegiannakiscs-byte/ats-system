import { z } from "zod";
import { sys, sysTx } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { hashPassword, rateLimit, sha256 } from "@/server/security";
import { audit } from "@/server/org";

const Body = z.object({ token: z.string().min(20).max(200), password: z.string().min(10, "Use at least 10 characters").max(200) });

export const POST = handler(async (req) => {
  if (!rateLimit(`reset:${clientIp(req)}`, 20, 15 * 60_000).ok) throw new HttpError(429, "Too many attempts", "rate_limited");
  const v = Body.parse(await req.json());
  const [r] = await sys<{ id: string; user_id: string }>("select id, user_id from password_resets where token_hash = $1 and used_at is null and expires_at > now()", [sha256(v.token)]);
  if (!r) throw new HttpError(400, "This recovery link is invalid or has expired", "invalid_token");
  await sysTx(async (q) => {
    await q("update users set password_hash = $2 where id = $1", [r.user_id, await hashPassword(v.password)]);
    await q("update password_resets set used_at = now() where id = $1", [r.id]);
    await q("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [r.user_id]);
  });
  await audit({ scope: "platform", action: "user.password_reset_completed", actorId: r.user_id, targetType: "user", targetId: r.user_id });
  return json({ ok: true });
});
