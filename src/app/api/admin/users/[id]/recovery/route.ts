import { z } from "zod";
import { sys } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";
import { randomToken, sha256 } from "@/server/security";

/** Secure access recovery: a one-time, 1-hour password reset link. Passwords are never viewable. */
export const POST = handler(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePlatformAdmin();
  const id = z.string().uuid().parse((await ctx.params).id);
  const [u] = await sys<{ email: string }>("select email from users where id = $1", [id]);
  if (!u) throw new HttpError(404, "User not found", "not_found");
  const token = randomToken();
  await sys("update password_resets set used_at = now() where user_id = $1 and used_at is null", [id]);
  await sys("insert into password_resets (user_id, token_hash, created_by, expires_at) values ($1,$2,$3, now() + interval '1 hour')", [id, sha256(token), admin.id]);
  await audit({ scope: "platform", action: "user.recovery_link_created", actorId: admin.id, targetType: "user", targetId: id, ip: clientIp(req) });
  return json({ link: `${env.appUrl}/reset/${token}`, expiresInMinutes: 60, email: u.email });
});
