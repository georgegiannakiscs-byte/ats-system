import { sys, tenantTx } from "@/server/db";
import { HttpError, handler } from "@/server/http";
import { requireOrg } from "@/server/org";
import { getObject } from "@/server/storage";

/** A candidate's optional photo - only when the company hasn't chosen to hide photos during screening. */
export const GET = handler(async (_req, ctx: { params: Promise<{ orgId: string; photoId: string }> }) => {
  const { orgId, photoId } = await ctx.params;
  const access = await requireOrg(orgId, "candidates.view");
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) throw new HttpError(404, "Not found", "not_found");
  const [org] = await sys<{ cv_settings: { hidePhotos?: boolean } }>("select cv_settings from organizations where id = $1", [orgId]);
  if (org?.cv_settings.hidePhotos) throw new HttpError(403, "Photos are hidden during screening in this company", "photos_hidden");
  const [p] = await tenantTx(orgId, access.user.id, (q) => q<{ storage_key: string }>("select storage_key from candidate_photos where id = $1", [photoId]));
  if (!p) throw new HttpError(404, "Not found", "not_found");
  const buf = await getObject(p.storage_key);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});
