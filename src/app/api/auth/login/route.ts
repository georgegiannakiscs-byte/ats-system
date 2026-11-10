import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit, verifyPassword } from "@/server/security";
import { createSession } from "@/server/auth";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) });

export const POST = handler(async (req) => {
  const ip = clientIp(req);
  const v = Body.parse(await req.json());
  if (!rateLimit(`login:${ip}`, 30, 15 * 60_000).ok || !rateLimit(`login:${v.email}`, 10, 15 * 60_000).ok)
    throw new HttpError(429, "Too many sign-in attempts. Please wait a few minutes.", "rate_limited");
  const [u] = await sys<{ id: string; password_hash: string; status: string }>("select id, password_hash, status from users where lower(email) = $1", [v.email]);
  const ok = u ? await verifyPassword(v.password, u.password_hash) : false;
  if (!u || !ok) throw new HttpError(401, "Email or password is incorrect", "invalid_credentials");
  if (u.status !== "active") throw new HttpError(403, "This account has been deactivated", "deactivated");
  await createSession(u.id, req);
  return json({ ok: true });
});
