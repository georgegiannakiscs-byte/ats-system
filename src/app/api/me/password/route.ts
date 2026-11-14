import { z } from "zod";
import { cookies } from "next/headers";
import { sysTx } from "@/server/db";
import { clientIp, handler, json } from "@/server/http";
import { SESSION_COOKIE, requireUser } from "@/server/auth";
import { audit } from "@/server/org";
import { confirmPassword } from "@/server/reauth";
import { hashPassword, sha256 } from "@/server/security";

const Body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(10, "Use at least 10 characters").max(200) });

/** Change password while signed in. Other sessions are signed out. */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const v = Body.parse(await req.json());
  await confirmPassword(user.id, v.currentPassword);
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await sysTx(async (q) => {
    await q("update users set password_hash = $2 where id = $1", [user.id, await hashPassword(v.newPassword)]);
    await q("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and token_hash <> $2", [user.id, sha256(token)]);
  });
  await audit({ scope: "platform", action: "user.password_changed", actorId: user.id, targetType: "user", targetId: user.id, ip: clientIp(req) });
  return json({ ok: true });
});
