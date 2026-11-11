import { sys } from "@/server/db";
import { clientIp, handler } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";

const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV export of talent leads (platform admin only). */
export const GET = handler(async (req) => {
  const admin = await requirePlatformAdmin();
  const rows = await sys<Record<string, unknown>>("select full_name, email, phone, role, current_company, language, source, utm_source, utm_medium, utm_campaign, status, admin_notes, cv_source, created_at from talent_leads order by created_at desc");
  const header = ["Full name", "Email", "Phone", "Role", "Current company", "Language", "Source", "UTM source", "UTM medium", "UTM campaign", "Status", "Notes", "CV", "Submitted"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) lines.push([r.full_name, r.email, r.phone, r.role, r.current_company, r.language, r.source, r.utm_source, r.utm_medium, r.utm_campaign, r.status, r.admin_notes, r.cv_source, (r.created_at as Date).toISOString()].map(cell).join(","));
  await audit({ scope: "platform", action: "talent_lead.exported", actorId: admin.id, metadata: { count: rows.length }, ip: clientIp(req) });
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="talent-leads.csv"', "Cache-Control": "no-store" } });
});
