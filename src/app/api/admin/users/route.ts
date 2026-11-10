import { sys } from "@/server/db";
import { handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { ROLE_LABEL, type OrgRole } from "@/server/permissions";

export const GET = handler(async (req) => {
  await requirePlatformAdmin();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const users = await sys<{ id: string; name: string; email: string; status: string; is_platform_admin: boolean; created_at: Date; last_login_at: Date | null }>(
    `select id, name, email, status, is_platform_admin, created_at, last_login_at from users
     where $1 = '' or name ilike '%' || $1 || '%' or email ilike '%' || $1 || '%' order by created_at desc limit 300`, [q]);
  const memberships = await sys<{ user_id: string; org_id: string; org_name: string; role: OrgRole; status: string }>(
    "select m.user_id, m.org_id, o.name as org_name, m.role, m.status from memberships m join organizations o on o.id = m.org_id where m.user_id = any($1)", [users.map((u) => u.id)]);
  const invitations = await sys(`select i.id, i.email, i.role, i.created_at, i.expires_at, o.name as company from invitations i join organizations o on o.id = i.org_id
    where i.accepted_at is null and i.revoked_at is null and i.expires_at > now() order by i.created_at desc limit 100`);
  return json({
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status, isPlatformAdmin: u.is_platform_admin, createdAt: u.created_at, lastLoginAt: u.last_login_at,
      memberships: memberships.filter((m) => m.user_id === u.id).map((m) => ({ orgId: m.org_id, company: m.org_name, role: ROLE_LABEL[m.role], status: m.status })) })),
    invitations,
  });
});
