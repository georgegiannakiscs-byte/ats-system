import { z } from "zod";
import { sys } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { hashPassword, rateLimit } from "@/server/security";
import { createSession } from "@/server/auth";
import { audit } from "@/server/org";

const Body = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export const POST = handler(async (req) => {
  const ip = clientIp(req);
  if (!rateLimit(`signup:${ip}`, 10, 60 * 60_000).ok) throw new HttpError(429, "Too many sign-ups from this network. Try again later.", "rate_limited");
  const v = Body.parse(await req.json());
  const [policy] = await sys<{ value: { policy?: string } }>("select value from platform_settings where key = 'signup'");
  if (policy?.value.policy === "invite_only" && !env.platformAdminEmails.includes(v.email)) {
    const invited = await sys("select 1 from invitations where lower(email) = $1 and accepted_at is null and revoked_at is null and expires_at > now()", [v.email]);
    if (!invited.length) throw new HttpError(403, "Sign-up is by invitation only. Ask your company administrator for an invitation.", "invite_only");
  }
  const exists = await sys("select 1 from users where lower(email) = $1", [v.email]);
  if (exists.length) throw new HttpError(409, "An account with this email already exists. Sign in instead.", "email_taken");
  const adminCount = Number((await sys<{ n: string }>("select count(*) n from users where is_platform_admin"))[0].n);
  const isAdmin = env.platformAdminEmails.includes(v.email) || (env.bootstrapFirstAdmin && adminCount === 0);
  const [u] = await sys<{ id: string }>("insert into users (email, name, password_hash, is_platform_admin) values ($1,$2,$3,$4) returning id", [v.email, v.name, await hashPassword(v.password), isAdmin]);
  await audit({ scope: "platform", action: isAdmin ? "user.registered_as_platform_admin" : "user.registered", actorId: u.id, targetType: "user", targetId: u.id, ip });
  await createSession(u.id, req);
  return json({ ok: true, isPlatformAdmin: isAdmin }, 201);
});
