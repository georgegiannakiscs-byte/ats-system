import { z } from "zod";
import { sys } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, handler, json } from "@/server/http";
import { audit, requireOrg } from "@/server/org";
import { randomToken, sha256 } from "@/server/security";
import { ROLE_FROM_LABEL } from "@/server/permissions";
import { sendMail } from "@/server/mail";

type Ctx = { params: Promise<{ orgId: string }> };
const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.enum(["Admin", "Recruiter", "Hiring Manager", "Interviewer"]) });

export const POST = handler(async (req, ctx: Ctx) => {
  const access = await requireOrg((await ctx.params).orgId, "team.manage");
  const v = Body.parse(await req.json());
  const member = await sys("select 1 from memberships m join users u on u.id = m.user_id where m.org_id = $1 and lower(u.email) = $2 and m.status = 'active'", [access.org.id, v.email]);
  if (member.length) throw new HttpError(409, "This person is already a member", "already_member");
  const token = randomToken();
  await sys("update invitations set revoked_at = now() where org_id = $1 and lower(email) = $2 and accepted_at is null and revoked_at is null", [access.org.id, v.email]);
  await sys("insert into invitations (org_id, email, role, token_hash, invited_by, expires_at) values ($1,$2,$3,$4,$5, now() + interval '7 days')", [access.org.id, v.email, ROLE_FROM_LABEL[v.role], sha256(token), access.user.id]);
  const link = `${env.appUrl}/invite/${token}`;
  const delivery = await sendMail(access.org.id, v.email, `You're invited to join ${access.org.name} on Déceler`, `${access.user.name} invited you to join ${access.org.name} as ${v.role}.\n\nAccept the invitation: ${link}\n\nThis link expires in 7 days.`, "invitation");
  await audit({ scope: "org", action: "member.invited", actorId: access.user.id, orgId: access.org.id, metadata: { email: v.email, role: v.role, delivery } });
  return json({ link, delivery }, 201);
});

export const DELETE = handler(async (req, ctx: Ctx) => {
  const access = await requireOrg((await ctx.params).orgId, "team.manage");
  const id = z.string().uuid().parse(new URL(req.url).searchParams.get("id"));
  await sys("update invitations set revoked_at = now() where id = $1 and org_id = $2", [id, access.org.id]);
  await audit({ scope: "org", action: "member.invitation_revoked", actorId: access.user.id, orgId: access.org.id, targetId: id });
  return json({ ok: true });
});
