import { z } from "zod";
import { sys, sysTx } from "@/server/db";
import { deleteOrgFiles } from "@/server/storage";
import { confirmPassword } from "@/server/reauth";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit, slugify } from "@/server/org";
import { logoUrl } from "@/server/workspace";
import { ROLE_LABEL, type OrgRole } from "@/server/permissions";

type Ctx = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();

export const GET = handler(async (_req, ctx: Ctx) => {
  await requirePlatformAdmin();
  const id = uuid.parse((await ctx.params).id);
  const [o] = await sys<{ id: string; slug: string; name: string; status: string; suspended_reason: string | null; suspended_at: Date | null; created_at: Date; profile: Record<string, unknown>; branding: Record<string, unknown>; onboarding: Record<string, unknown> }>(
    "select id, slug, name, status, suspended_reason, suspended_at, created_at, profile, branding, onboarding from organizations where id = $1", [id]);
  if (!o) throw new HttpError(404, "Company not found", "not_found");
  const members = await sys<{ id: string; name: string; email: string; role: OrgRole; status: string; last_accessed_at: Date | null }>(
    "select u.id, u.name, u.email, m.role, m.status, m.last_accessed_at from memberships m join users u on u.id = m.user_id where m.org_id = $1 order by m.created_at", [id]);
  const invitations = await sys("select id, email, role, created_at, expires_at, accepted_at, revoked_at from invitations where org_id = $1 order by created_at desc limit 50", [id]);
  const [usage] = await sys<Record<string, string>>(`select
    (select count(*) from jobs where org_id = $1) jobs, (select count(*) from jobs where org_id = $1 and status = 'published') published_jobs,
    (select count(*) from candidates where org_id = $1) candidates, (select count(*) from applications where org_id = $1) applications,
    (select coalesce(sum(size_bytes),0) from cv_documents where org_id = $1) cv_bytes, (select count(*) from email_outbox where org_id = $1) emails`, [id]);
  const features = await sys("select f.key, f.label, f.default_enabled, of.enabled as override from feature_flags f left join org_features of on of.feature_key = f.key and of.org_id = $1 order by f.position", [id]);
  const integrations = await sys("select provider, status, last_sync_at, failed_attempts, last_error from integrations where org_id = $1", [id]);
  return json({
    company: { ...o, logoUrl: logoUrl(o.id, o.branding), branding: { primaryColor: o.branding.primaryColor, careersLanguage: o.branding.careersLanguage } },
    members: members.map((m) => ({ ...m, role: ROLE_LABEL[m.role] })),
    invitations, usage: Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, Number(v)])), features, integrations,
  });
});

const Patch = z.object({ name: z.string().trim().min(2).max(120).optional(), slug: z.string().trim().max(48).optional(), status: z.enum(["active", "suspended"]).optional(), reason: z.string().trim().max(500).optional() });

export const PATCH = handler(async (req, ctx: Ctx) => {
  const admin = await requirePlatformAdmin();
  const id = uuid.parse((await ctx.params).id);
  const v = Patch.parse(await req.json());
  if (v.status === "suspended" && !v.reason) throw new HttpError(400, "Give a reason for suspending this company", "validation");
  if (v.slug) {
    const s = slugify(v.slug);
    if ((await sys("select 1 from organizations where slug = $1 and id <> $2", [s, id])).length) throw new HttpError(409, "That address is already taken", "slug_taken");
    v.slug = s;
  }
  const rows = await sys(
    `update organizations set name = coalesce($2, name), slug = coalesce($3, slug),
       status = coalesce($4, status),
       suspended_reason = case when $4 = 'suspended' then $5 when $4 = 'active' then null else suspended_reason end,
       suspended_at = case when $4 = 'suspended' then now() when $4 = 'active' then null else suspended_at end
     where id = $1 returning id`,
    [id, v.name ?? null, v.slug ?? null, v.status ?? null, v.reason ?? null],
  );
  if (!rows.length) throw new HttpError(404, "Company not found", "not_found");
  const action = v.status === "suspended" ? "company.suspended" : v.status === "active" ? "company.reactivated" : "company.updated_by_platform_admin";
  await audit({ scope: "platform", action, actorId: admin.id, orgId: id, targetType: "organization", targetId: id, metadata: v, ip: clientIp(req) });
  return json({ ok: true });
});

const Delete = z.object({
  confirmName: z.string().trim().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(500),
  password: z.string().min(1).max(200),
});

/**
 * Permanently deletes a company and everything in it: jobs, candidates, applications, CVs and other
 * files, notes, interviews, Quick Check data, members, invitations and settings. User accounts stay
 * (they may belong to other companies). The audit log keeps a record of the deletion.
 */
export const DELETE = handler(async (req, ctx: Ctx) => {
  const admin = await requirePlatformAdmin();
  const id = uuid.parse((await ctx.params).id);
  const v = Delete.parse(await req.json());
  await confirmPassword(admin.id, v.password);
  const [o] = await sys<{ name: string; slug: string }>("select name, slug from organizations where id = $1", [id]);
  if (!o) throw new HttpError(404, "Company not found", "not_found");
  if (v.confirmName !== o.name.trim()) throw new HttpError(400, `Type the company name exactly: ${o.name}`, "name_mismatch");
  const counts = await sysTx(async (q) => {
    const [c] = await q<Record<string, string>>(`select (select count(*) from jobs where org_id = $1) jobs, (select count(*) from candidates where org_id = $1) candidates,
      (select count(*) from applications where org_id = $1) applications, (select count(*) from memberships where org_id = $1) members`, [id]);
    await deleteOrgFiles(id, q);
    await q("delete from organizations where id = $1", [id]); // everything else cascades
    return Object.fromEntries(Object.entries(c).map(([k, n]) => [k, Number(n)]));
  });
  await deleteOrgFiles(id).catch((e) => console.error("[delete-company] files", e)); // disk storage: after the commit
  await audit({ scope: "platform", action: "company.deleted", actorId: admin.id, targetType: "organization", targetId: id, metadata: { name: o.name, slug: o.slug, reason: v.reason, ...counts }, ip: clientIp(req) });
  return json({ ok: true, deleted: counts });
});
