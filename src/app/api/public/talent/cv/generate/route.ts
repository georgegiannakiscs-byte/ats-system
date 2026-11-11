import crypto from "node:crypto";
import { z } from "zod";
import { sys } from "@/server/db";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { randomToken, rateLimit, sha256 } from "@/server/security";
import { putObject } from "@/server/storage";
import { cvFileName, photoFromDataUrl } from "@/server/cv/build";
import { renderCvPdf } from "@/server/cv/pdf";
import { allowedTemplates } from "@/server/public";
import { CV_TEMPLATES, CvDataSchema } from "@/lib/cv/schema";

const Body = z.object({
  template: z.enum(CV_TEMPLATES),
  lang: z.enum(["en", "el"]).default("en"),
  data: CvDataSchema,
  photo: z.string().max(4_500_000).optional().nullable(),
});

/** CV Builder for the /talent page: renders the PDF and keeps it as a single-use draft (6 hours). */
export const POST = handler(async (req) => {
  if (!rateLimit(`talentcv:${clientIp(req)}`, 60, 60 * 60_000).ok) throw new HttpError(429, "Too many CVs generated from this network. Please try again later.", "rate_limited");
  const v = Body.parse(await req.json());
  if (!(await allowedTemplates({})).includes(v.template)) throw new HttpError(400, "This template isn't available", "template_unavailable");
  const photo = await photoFromDataUrl(v.photo, v.data.photoShape);
  const pdf = await renderCvPdf(v.data, v.template, v.lang, photo);
  const id = crypto.randomUUID();
  const key = `talent-drafts/${id}.pdf`;
  await putObject(key, pdf);
  const token = randomToken();
  await sys(
    "insert into talent_cv_drafts (id, token_hash, template, data, storage_key, size_bytes, sha256, expires_at) values ($1,$2,$3,$4,$5,$6,$7, now() + interval '6 hours')",
    [id, sha256(token), v.template, JSON.stringify(v.data), key, pdf.length, crypto.createHash("sha256").update(pdf).digest("hex")],
  );
  return json({ token, fileName: cvFileName(v.data.personal.fullName), sizeBytes: pdf.length, previewUrl: `/api/public/talent/cv/draft/${token}` }, 201);
});
