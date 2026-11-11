import sharp from "sharp";
import { sys } from "@/server/db";
import { HttpError, handler, json } from "@/server/http";
import { audit, requireOrg } from "@/server/org";
import { deleteObject, putObject, sniffImage, svgIsSafe } from "@/server/storage";
import { randomToken } from "@/server/security";
import { logoUrl } from "@/server/workspace";

type Ctx = { params: Promise<{ orgId: string }> };

export const POST = handler(async (req, ctx: Ctx) => {
  const access = await requireOrg((await ctx.params).orgId, "branding.manage");
  const form = await req.formData();
  const file = form.get("file");
  const variant = form.get("variant") === "dark" ? "dark" : "light";
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image to upload", "validation");
  const [limits] = await sys<{ value: { maxLogoMb: number } }>("select value from platform_settings where key = 'storage'");
  const max = (limits?.value.maxLogoMb ?? 2) * 1024 * 1024;
  if (file.size > max) throw new HttpError(413, `Logos must be smaller than ${limits?.value.maxLogoMb ?? 2} MB`, "too_large");
  let buf: Buffer = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(buf);
  if (!type) throw new HttpError(415, "Use a PNG, JPG, WebP or SVG image", "unsupported_type");
  if (type.ext === "svg") {
    if (!svgIsSafe(buf.toString("utf8"))) throw new HttpError(415, "This SVG contains scripts or external references and can't be used", "unsafe_svg");
  } else {
    // Normalise orientation, strip metadata and cap dimensions; transparency is preserved.
    const img = sharp(buf, { failOn: "error" }).rotate().resize({ width: 1600, height: 800, fit: "inside", withoutEnlargement: true });
    buf = type.ext === "png" ? await img.png().toBuffer() : type.ext === "webp" ? await img.webp({ quality: 92 }).toBuffer() : await img.jpeg({ quality: 90 }).toBuffer();
  }
  const key = `logos/${access.org.id}/${variant}-${randomToken(9).replace(/[^a-z0-9]/gi, "x")}.${type.ext}`;
  await putObject(key, buf);
  const prefix = variant === "dark" ? "logoDark" : "logo";
  const [prev] = await sys<{ branding: Record<string, string> }>("select branding from organizations where id = $1", [access.org.id]);
  const [row] = await sys<{ branding: Record<string, unknown> }>(
    "update organizations set branding = branding || $2::jsonb where id = $1 returning branding",
    [access.org.id, JSON.stringify({ [`${prefix}Key`]: key, [`${prefix}Mime`]: type.mime, [`${prefix}Version`]: Date.now().toString(36) })],
  );
  if (prev?.branding[`${prefix}Key`]) await deleteObject(prev.branding[`${prefix}Key`]).catch(() => {});
  await audit({ scope: "org", action: "company.logo_uploaded", actorId: access.user.id, orgId: access.org.id, metadata: { variant, type: type.mime, bytes: buf.length } });
  return json({ url: logoUrl(access.org.id, row.branding, variant) }, 201);
});

export const DELETE = handler(async (req, ctx: Ctx) => {
  const access = await requireOrg((await ctx.params).orgId, "branding.manage");
  const variant = new URL(req.url).searchParams.get("variant") === "dark" ? "dark" : "light";
  const prefix = variant === "dark" ? "logoDark" : "logo";
  const [prev] = await sys<{ branding: Record<string, string> }>("select branding from organizations where id = $1", [access.org.id]);
  if (prev?.branding[`${prefix}Key`]) await deleteObject(prev.branding[`${prefix}Key`]).catch(() => {});
  await sys(`update organizations set branding = branding - '${prefix}Key' - '${prefix}Mime' - '${prefix}Version' where id = $1`, [access.org.id]);
  await audit({ scope: "org", action: "company.logo_removed", actorId: access.user.id, orgId: access.org.id, metadata: { variant } });
  return json({ ok: true });
});
