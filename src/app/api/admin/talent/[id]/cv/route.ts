import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler } from "@/server/http";
import { requirePlatformAdmin } from "@/server/auth";
import { audit } from "@/server/org";
import { getObject } from "@/server/storage";

/** The lead's CV, streamed to the platform admin only (inline for PDFs, otherwise a download). */
export const GET = handler(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePlatformAdmin();
  const id = z.string().uuid().parse((await ctx.params).id);
  const [r] = await sys<{ cv_key: string; cv_file_name: string; cv_mime: string }>("select cv_key, cv_file_name, cv_mime from talent_leads where id = $1", [id]);
  if (!r) throw new HttpError(404, "Lead not found", "not_found");
  const buf = await getObject(r.cv_key).catch(() => null);
  if (!buf) throw new HttpError(404, "The CV file is missing", "not_found");
  const download = new URL(req.url).searchParams.get("download") === "1";
  await audit({ scope: "platform", action: download ? "talent_lead.cv_downloaded" : "talent_lead.cv_viewed", actorId: admin.id, targetType: "talent_lead", targetId: id, ip: clientIp(req) });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": r.cv_mime,
      "Content-Disposition": `${download || r.cv_mime !== "application/pdf" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(r.cv_file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
});
