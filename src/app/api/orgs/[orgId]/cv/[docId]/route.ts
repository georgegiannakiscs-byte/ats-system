import { tenantTx } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { audit, requireOrg } from "@/server/org";
import { signPayload } from "@/server/security";

/** Issues a short-lived signed URL for a CV. The file route re-checks membership too. */
export const GET = handler(async (req, ctx: { params: Promise<{ orgId: string; docId: string }> }) => {
  const { orgId, docId } = await ctx.params;
  const access = await requireOrg(orgId, "cv.download");
  if (!/^[0-9a-f-]{36}$/i.test(docId)) throw new HttpError(404, "Document not found", "not_found");
  const [doc] = await tenantTx(orgId, access.user.id, (q) => q<{ storage_key: string; file_name: string; mime_type: string; candidate_id: string }>("select storage_key, file_name, mime_type, candidate_id from cv_documents where id = $1", [docId]));
  if (!doc) throw new HttpError(404, "Document not found", "not_found");
  const download = new URL(req.url).searchParams.get("download") === "1";
  const token = signPayload({ k: doc.storage_key, o: orgId, d: docId, u: access.user.id, n: doc.file_name, m: doc.mime_type, a: download ? 1 : 0 }, 300);
  await audit({ scope: "org", action: download ? "cv.downloaded" : "cv.viewed", actorId: access.user.id, orgId, targetType: "cv_document", targetId: docId });
  return json({ url: `/api/files/${token}`, expiresIn: 300 });
});
