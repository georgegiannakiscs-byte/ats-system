import sharp from "sharp";
import { sys } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { audit, requireOrg } from "@/server/org";
import { deleteObject, putObject, sniffImage } from "@/server/storage";
import { randomToken } from "@/server/security";
import { coverUrl } from "@/server/branding";

type Ctx = { params: Promise<{ orgId: string }> };

const MAX_MB = 10;
const MIN_WIDTH = 1000;

/**
 * Careers cover image. Photos only (PNG/JPG/WebP, never SVG). Every upload is decoded and re-encoded:
 * that fixes the orientation, strips metadata such as GPS location and caps the size.
 */
export const POST = handler(async (req, ctx: Ctx) => {
  const access = await requireOrg((await ctx.params).orgId, "branding.manage");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image to upload", "validation");
  if (file.size > MAX_MB * 1024 * 1024) throw new HttpError(413, `Cover images must be smaller than ${MAX_MB} MB`, "too_large");
  const input = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(input);
  if (!type || type.ext === "svg") throw new HttpError(415, "Use a JPG, PNG or WebP photo", "unsupported_type");
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new HttpError(415, "This image can't be read. Try saving it again as JPG", "unsupported_type");
  }
  // Width after EXIF rotation (orientation 5–8 swaps the sides).
  const width = (meta.orientation ?? 1) >= 5 ? meta.height : meta.width;
  if (!width || width < MIN_WIDTH) throw new HttpError(400, `Use an image at least ${MIN_WIDTH} pixels wide (this one is ${width ?? "?"}), so it stays sharp on large screens`, "too_small");
  const buf = await sharp(input, { failOn: "error" }).rotate().resize({ width: 2400, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const key = `covers/${access.org.id}/${randomToken(9).replace(/[^a-z0-9]/gi, "x")}.webp`;
  await putObject(key, buf);
  const [prev] = await sys<{ branding: Record<string, string> }>("select branding from organizations where id = $1", [access.org.id]);
  const [row] = await sys<{ branding: Record<string, unknown> }>(
    "update organizations set branding = branding || $2::jsonb where id = $1 returning branding",
    [access.org.id, JSON.stringify({ coverKey: key, coverVersion: Date.now().toString(36) })],
  );
  if (prev?.branding.coverKey) await deleteObject(prev.branding.coverKey).catch(() => {});
  await audit({ scope: "org", action: "company.cover_uploaded", actorId: access.user.id, orgId: access.org.id, metadata: { bytes: buf.length } });
  return json({ url: coverUrl(access.org.id, row.branding) }, 201);
});

export const DELETE = handler(async (_req, ctx: Ctx) => {
  const access = await requireOrg((await ctx.params).orgId, "branding.manage");
  const [prev] = await sys<{ branding: Record<string, string> }>("select branding from organizations where id = $1", [access.org.id]);
  if (prev?.branding.coverKey) await deleteObject(prev.branding.coverKey).catch(() => {});
  await sys("update organizations set branding = branding - 'coverKey' - 'coverVersion' where id = $1", [access.org.id]);
  await audit({ scope: "org", action: "company.cover_removed", actorId: access.user.id, orgId: access.org.id });
  return json({ ok: true });
});
