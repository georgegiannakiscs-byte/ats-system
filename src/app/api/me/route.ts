import { sys } from "@/server/db";
import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { logoUrl } from "@/server/workspace";
import { ROLE_LABEL, type OrgRole } from "@/server/permissions";

export const GET = handler(async () => {
  const user = await requireUser();
  const orgs = await sys<{ id: string; slug: string; name: string; status: string; role: OrgRole; branding: Record<string, unknown>; last_accessed_at: Date | null }>(
    `select o.id, o.slug, o.name, o.status, m.role, o.branding, m.last_accessed_at from memberships m join organizations o on o.id = m.org_id
     where m.user_id = $1 and m.status = 'active' order by m.last_accessed_at desc nulls last, o.name`,
    [user.id],
  );
  const [m] = await sys<{ value: { enabled: boolean; message: string } }>("select value from platform_settings where key = 'maintenance'");
  return json({
    maintenance: m?.value.enabled ? { message: m.value.message || "Scheduled maintenance is in progress." } : null,
    user,
    companies: orgs.map((o) => ({ id: o.id, slug: o.slug, name: o.name, status: o.status, role: o.role, roleLabel: ROLE_LABEL[o.role], logoUrl: logoUrl(o.id, o.branding), primaryColor: (o.branding.primaryColor as string) ?? null, lastAccessedAt: o.last_accessed_at })),
  });
});
