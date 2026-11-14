import { sys } from "@/server/db";
import { env } from "@/server/env";
import { handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { TALENT_COLUMNS, TALENT_STATUSES, toLead, type TalentRow } from "@/server/talent";

/** Talent leads from the public /talent page (platform admin only). */
export const GET = handler(async (req) => {
  await requirePlatformAdmin();
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 100);
  const status = u.searchParams.get("status");
  const st = (TALENT_STATUSES as readonly string[]).includes(status ?? "") ? status : null;
  const rows = await sys<TalentRow>(
    `select ${TALENT_COLUMNS} from talent_leads
     where ($1::text is null or status = $1) and ($2 = '' or full_name ilike '%' || $2 || '%' or email ilike '%' || $2 || '%' or role ilike '%' || $2 || '%' or current_company ilike '%' || $2 || '%')
     order by created_at desc limit 500`,
    [st, q],
  );
  const [counts] = await sys<Record<string, number>>(
    "select count(*)::int total, count(*) filter (where status = 'new')::int new, count(*) filter (where status = 'reviewed')::int reviewed, count(*) filter (where status = 'contacted')::int contacted, count(*) filter (where status = 'archived')::int archived from talent_leads",
  );
  return json({ leads: rows.map(toLead), counts, links: { en: `${env.appUrl}/talent?lang=en&utm_source=linkedin&utm_medium=social` } }, { headers: { "Cache-Control": "private, no-store" } });
});
