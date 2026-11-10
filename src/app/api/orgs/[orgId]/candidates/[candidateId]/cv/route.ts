import { tenantTx } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { requireOrg } from "@/server/org";
import { insertCvRow, storeCv } from "@/server/cv";

export const POST = handler(async (req, ctx: { params: Promise<{ orgId: string; candidateId: string }> }) => {
  const { orgId, candidateId } = await ctx.params;
  const access = await requireOrg(orgId, "candidates.edit");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a CV file", "validation");
  const exists = await tenantTx(orgId, access.user.id, (q) => q("select 1 from candidates where id = $1", [candidateId]));
  if (!exists.length) throw new HttpError(404, "Candidate not found", "not_found");
  const cv = await storeCv(orgId, file);
  await tenantTx(orgId, access.user.id, async (q) => {
    await insertCvRow(q, orgId, candidateId, null, cv, access.user.id);
    await q("insert into activities (org_id, kind, actor_id, candidate_id, message) values ($1,'candidate_updated',$2,$3,$4)", [orgId, access.user.id, candidateId, `uploaded a CV (${cv.fileName})`]);
  });
  return json({ ok: true, scanStatus: cv.scanStatus }, 201);
});
