import { sys, tenantTx } from "@/server/db";
import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { logoUrl } from "@/server/workspace";
import { ROLE_LABEL, type OrgRole } from "@/server/permissions";

/** "All my companies": per-company counts, each computed under that company's RLS context. */
export const GET = handler(async () => {
  const user = await requireUser();
  const orgs = await sys<{ id: string; slug: string; name: string; role: OrgRole; branding: Record<string, unknown>; status: string }>(
    "select o.id, o.slug, o.name, o.status, m.role, o.branding from memberships m join organizations o on o.id = m.org_id where m.user_id = $1 and m.status = 'active' order by o.name",
    [user.id],
  );
  const companies = [];
  for (const o of orgs) {
    const base = { id: o.id, slug: o.slug, name: o.name, status: o.status, role: ROLE_LABEL[o.role], logoUrl: logoUrl(o.id, o.branding), primaryColor: (o.branding.primaryColor as string) ?? "#193329" };
    if (o.status !== "active") { companies.push({ ...base, stats: null }); continue; }
    const stats = await tenantTx(o.id, user.id, async (q) => {
      const [r] = await q<Record<string, string>>(`select
        (select count(*) from jobs where status = 'published') as active_jobs,
        (select count(*) from applications where applied_at > now() - interval '7 days') as new_applications,
        (select count(*) from applications where status = 'active' and stage = 'applied') as awaiting_review,
        (select count(*) from workspace_records where kind = 'task' and coalesce((data->>'done')::boolean, false) = false) as open_tasks,
        (select count(*) from workspace_records where kind = 'task' and coalesce((data->>'done')::boolean, false) = false and (data->>'dueDate')::timestamptz < now()) as overdue_tasks,
        (select count(*) from workspace_records where kind = 'interview' and data->>'status' = 'scheduled' and (data->>'start')::timestamptz > now()) as upcoming_interviews`);
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]));
    });
    companies.push({ ...base, stats });
  }
  return json({ companies });
});
