import { sys } from "@/server/db";
import { handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";

export const GET = handler(async (req) => {
  await requirePlatformAdmin();
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim();
  const scope = u.searchParams.get("scope");
  const page = Math.max(0, Number(u.searchParams.get("page") ?? 0));
  const rows = await sys(
    `select a.id, a.scope, a.action, a.target_type, a.target_id, a.metadata, a.ip, a.created_at, u.email as actor, o.name as company
     from audit_logs a left join users u on u.id = a.actor_id left join organizations o on o.id = a.org_id
     where ($1 = '' or a.action ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%' or o.name ilike '%' || $1 || '%') and ($2::text is null or a.scope = $2)
     order by a.id desc limit 50 offset $3`,
    [q, scope, page * 50],
  );
  return json({ entries: rows, page });
});
