import "server-only";
import { sys } from "./db";
import { HttpError } from "./http";
import { requireUser, type SessionUser } from "./auth";
import { can, type OrgRole, type Permission } from "./permissions";

export interface OrgAccess {
  user: SessionUser;
  org: { id: string; slug: string; name: string; status: string };
  role: OrgRole;
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorises the current user for an organisation by its stable ID.
 * Slugs are only used for routing; permissions are always resolved by org ID.
 */
export async function requireOrg(orgId: string, permission: Permission = "workspace.view"): Promise<OrgAccess> {
  const user = await requireUser();
  if (!uuidRe.test(orgId)) throw new HttpError(404, "Company not found", "not_found");
  const rows = await sys<{ id: string; slug: string; name: string; status: string; role: OrgRole }>(
    `select o.id, o.slug, o.name, o.status, m.role from organizations o
     join memberships m on m.org_id = o.id and m.user_id = $2 and m.status = 'active' where o.id = $1`,
    [orgId, user.id],
  );
  const r = rows[0];
  // Same response for "doesn't exist" and "not a member" - avoids leaking which companies exist.
  if (!r) throw new HttpError(404, "Company not found", "not_found");
  if (r.status !== "active") throw new HttpError(423, "This company workspace is suspended. Contact Ulysse support.", "suspended");
  if (!can(r.role, permission)) throw new HttpError(403, "You don't have permission to do that in this company", "forbidden");
  return { user, org: { id: r.id, slug: r.slug, name: r.name, status: r.status }, role: r.role };
}

export async function audit(entry: { scope: "platform" | "org"; action: string; actorId?: string; orgId?: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown>; ip?: string }) {
  await sys("insert into audit_logs (scope, action, actor_id, org_id, target_type, target_id, metadata, ip) values ($1,$2,$3,$4,$5,$6,$7,$8)", [
    entry.scope, entry.action, entry.actorId ?? null, entry.orgId ?? null, entry.targetType ?? null, entry.targetId ?? null, JSON.stringify(entry.metadata ?? {}), entry.ip ?? null,
  ]);
}

export function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "company";
}

export async function uniqueOrgSlug(base: string) {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const s = i === 0 ? root : `${root}-${i + 1}`;
    const rows = await sys("select 1 from organizations where slug = $1", [s]);
    if (!rows.length) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Feature entitlement: per-company override, else platform default. */
export async function featureEnabled(orgId: string, key: string) {
  const rows = await sys<{ enabled: boolean }>(
    `select coalesce(of.enabled, f.default_enabled) as enabled from feature_flags f left join org_features of on of.feature_key = f.key and of.org_id = $1 where f.key = $2`,
    [orgId, key],
  );
  return rows[0]?.enabled ?? false;
}
