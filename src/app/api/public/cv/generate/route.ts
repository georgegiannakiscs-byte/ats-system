import crypto from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { randomToken, rateLimit, sha256 } from "@/server/security";
import { putObject, sniffImage } from "@/server/storage";
import { renderCvPdf } from "@/server/cv/pdf";
import { allowedTemplates, assertCvBuilder, publicJob } from "@/server/public";
import { CV_TEMPLATES, CvDataSchema } from "@/lib/cv/schema";

const Body = z.object({
  orgSlug: z.string().max(60),
  jobSlug: z.string().max(120),
  template: z.enum(CV_TEMPLATES),
  lang: z.enum(["en", "el"]).default("en"),
  data: CvDataSchema,
  photo: z.string().max(4_500_000).optional().nullable(), // data URL of the cropped photo (optional)
});

/**
 * Builds the candidate's CV as a PDF and stores it privately as a single-use draft.
 * The returned token attaches it to the application — the candidate never re-uploads it.
 */
export const POST = handler(async (req) => {
  if (!rateLimit(`cvgen:${clientIp(req)}`, 60, 60 * 60_000).ok) throw new HttpError(429, "Too many CVs generated from this network. Please try again later.", "rate_limited");
  const v = Body.parse(await req.json());
  const job = await publicJob(v.orgSlug, v.jobSlug);
  await assertCvBuilder(job.org_id);
  if (!(await allowedTemplates(job.cv_settings)).includes(v.template)) throw new HttpError(400, "This template isn't available", "template_unavailable");

  let photo: Buffer | null = null;
  if (v.photo) {
    const m = v.photo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new HttpError(415, "Use a JPG, PNG or WebP photo", "photo_type");
    const raw = Buffer.from(m[2], "base64");
    const kind = sniffImage(raw);
    if (!kind || kind.ext === "svg") throw new HttpError(415, "Use a JPG, PNG or WebP photo", "photo_type");
    // Re-encode: strips metadata (incl. location), normalises orientation, caps size.
    const ratio = v.data.photoShape === "circle" ? 1 : 1.25;
    photo = await sharp(raw, { failOn: "error" }).rotate().resize({ width: 600, height: Math.round(600 * ratio), fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
  }

  const pdf = await renderCvPdf(v.data, v.template, v.lang, photo);
  const id = crypto.randomUUID();
  const key = `cv-drafts/${job.org_id}/${id}.pdf`;
  await putObject(key, pdf);
  let photoKey: string | null = null;
  if (photo) {
    photoKey = `cv-photos/${job.org_id}/${id}.jpg`;
    await putObject(photoKey, photo);
  }
  const token = randomToken();
  await sys(
    "insert into cv_drafts (id, org_id, job_id, token_hash, template, data, storage_key, photo_key, size_bytes, sha256, expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + interval '6 hours')",
    [id, job.org_id, job.id, sha256(token), v.template, JSON.stringify(v.data), key, photoKey, pdf.length, crypto.createHash("sha256").update(pdf).digest("hex")],
  );
  const fileName = `${v.data.personal.fullName.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "_") || "CV"}_CV.pdf`;
  return json({ token, fileName, sizeBytes: pdf.length, previewUrl: `/api/public/cv/draft/${token}` }, 201);
});
