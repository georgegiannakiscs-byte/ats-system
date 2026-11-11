import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";
import { deleteObject } from "@/server/storage";
import { TALENT_COLUMNS, TALENT_STATUSES, toLead, type TalentRow } from "@/server/talent";

type Ctx = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();

export const PATCH = handler(async (req, ctx: Ctx) => {
  const admin = await requirePlatformAdmin();
  const id = uuid.parse((await ctx.params).id);
  const v = z.object({ status: z.enum(TALENT_STATUSES), adminNotes: z.string().max(4000) }).partial().parse(await req.json());
  const [row] = await sys<TalentRow>(
    `update talent_leads set status = coalesce($2, status), admin_notes = coalesce($3, admin_notes), updated_at = now() where id = $1 returning ${TALENT_COLUMNS}`,
    [id, v.status ?? null, v.adminNotes ?? null],
  );
  if (!row) throw new HttpError(404, "Lead not found", "not_found");
  await audit({ scope: "platform", action: "talent_lead.updated", actorId: admin.id, targetType: "talent_lead", targetId: id, metadata: { fields: Object.keys(v) }, ip: clientIp(req) });
  return json({ lead: toLead(row) });
});

/** Erasure (e.g. GDPR request): deletes the lead and its CV file. */
export const DELETE = handler(async (req, ctx: Ctx) => {
  const admin = await requirePlatformAdmin();
  const id = uuid.parse((await ctx.params).id);
  const [row] = await sys<{ cv_key: string }>("delete from talent_leads where id = $1 returning cv_key", [id]);
  if (!row) throw new HttpError(404, "Lead not found", "not_found");
  await deleteObject(row.cv_key).catch(() => {});
  await audit({ scope: "platform", action: "talent_lead.deleted", actorId: admin.id, targetType: "talent_lead", targetId: id, ip: clientIp(req) });
  return json({ ok: true });
});
