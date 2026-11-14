import { sys } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { getUser, requireUser } from "@/server/auth";
import { audit } from "@/server/org";
import { sha256 } from "@/server/security";
import { ROLE_LABEL, type OrgRole } from "@/server/permissions";

type Ctx = { params: Promise<{ token: string }> };
async function find(token: string) {
  const [inv] = await sys<{ id: string; org_id: string; email: string; role: OrgRole; org_name: string; slug: string; status: string }>(
    `select i.id, i.org_id, i.email, i.role, o.name as org_name, o.slug, o.status from invitations i join organizations o on o.id = i.org_id
     where i.token_hash = $1 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`,
    [sha256(token)],
  );
  return inv;
}

export const GET = handler(async (_req, ctx: Ctx) => {
  const inv = await find((await ctx.params).token);
  if (!inv) throw new HttpError(404, "This invitation is invalid or has expired", "invalid_invitation");
  const user = await getUser();
  return json({ companyName: inv.org_name, email: inv.email, role: ROLE_LABEL[inv.role], signedInAs: user?.email ?? null, emailMatches: user ? user.email.toLowerCase() === inv.email.toLowerCase() : null });
});

export const POST = handler(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const inv = await find((await ctx.params).token);
  if (!inv) throw new HttpError(404, "This invitation is invalid or has expired", "invalid_invitation");
  if (inv.status !== "active") throw new HttpError(423, "This company workspace is archived", "suspended");
  if (user.email.toLowerCase() !== inv.email.toLowerCase()) throw new HttpError(403, `This invitation was sent to ${inv.email}. Sign in with that email to accept it.`, "email_mismatch");
  await sys(
    `insert into memberships (org_id, user_id, role, last_accessed_at) values ($1,$2,$3, now())
     on conflict (org_id, user_id) do update set role = excluded.role, status = 'active'`,
    [inv.org_id, user.id, inv.role],
  );
  await sys("update invitations set accepted_at = now(), accepted_by = $2 where id = $1", [inv.id, user.id]);
  await audit({ scope: "org", action: "member.invitation_accepted", actorId: user.id, orgId: inv.org_id, metadata: { role: inv.role } });
  return json({ slug: inv.slug });
});
