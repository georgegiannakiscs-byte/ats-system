import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit } from "@/server/security";
import { sniffCv } from "@/server/storage";
import { cvText, contactDetails } from "@/server/cv/text";
import { assertCvBuilder, publicJob } from "@/server/public";
import { aiUnavailableReason } from "@/server/ai/claude";
import { structureCvText } from "@/server/ai/tasks";
import { maxCvBytes } from "@/server/cv";

/**
 * "Create a new CV from this file": returns suggested CV data for the candidate to REVIEW.
 * Nothing is stored. Contact details are found deterministically; the rest uses Claude only
 * when configured. If extraction fails the candidate simply keeps their uploaded file.
 */
export const POST = handler(async (req) => {
  if (!rateLimit(`cvx:${clientIp(req)}`, 20, 60 * 60_000).ok) throw new HttpError(429, "Too many requests. Please try again later.", "rate_limited");
  const form = await req.formData();
  const job = await publicJob(String(form.get("orgSlug") ?? ""), String(form.get("jobSlug") ?? ""));
  await assertCvBuilder(job.org_id);
  const file = form.get("cv");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Attach your CV", "cv_missing");
  if (file.size > (await maxCvBytes())) throw new HttpError(413, "This file is too large", "cv_too_large");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffCv(buf);
  if (!kind) throw new HttpError(415, "Use a PDF or Word (.docx) file", "cv_type");
  const text = await cvText(buf, kind.mime).catch(() => "");
  if (text.length < 40) return json({ prefill: null, method: "none", note: "We couldn't read text from this file (it may be a scanned image). You can still apply with it, or build your CV from scratch." });
  const contact = contactDetails(text);
  const reason = await aiUnavailableReason(job.org_id, "cv_extract");
  if (reason) return json({ prefill: { ...contact }, method: "contact_only", note: "We filled in your contact details. Add the rest in the builder." });
  try {
    const { data } = await structureCvText(job.org_id, text);
    return json({ prefill: { ...data, email: data.email || contact.email, phone: data.phone || contact.phone, linkedinUrl: data.linkedinUrl || contact.linkedinUrl }, method: "ai", note: "Review every section — we copied what we found and left the rest empty." });
  } catch {
    return json({ prefill: { ...contact }, method: "contact_only", note: "We filled in your contact details. Add the rest in the builder." });
  }
});
