import crypto from "node:crypto";
import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { randomToken, rateLimit, sha256 } from "@/server/security";
import { putObject } from "@/server/storage";
import { cvFileName, photoFromDataUrl } from "@/server/cv/build";
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
 * The returned token attaches it to the application - the candidate never re-uploads it.
 */
export const POST = handler(async (req) => {
  if (!rateLimit(`cvgen:${clientIp(req)}`, 60, 60 * 60_000).ok) throw new HttpError(429, "Too many CVs generated from this network. Please try again later.", "rate_limited");
  const v = Body.parse(await req.json());
  const job = await publicJob(v.orgSlug, v.jobSlug);
  await assertCvBuilder(job.org_id);
  if (!(await allowedTemplates(job.cv_settings)).includes(v.template)) throw new HttpError(400, "This template isn't available", "template_unavailable");

  const photo = await photoFromDataUrl(v.photo, v.data.photoShape);

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
  const fileName = cvFileName(v.data.personal.fullName);
  return json({ token, fileName, sizeBytes: pdf.length, previewUrl: `/api/public/cv/draft/${token}` }, 201);
});
