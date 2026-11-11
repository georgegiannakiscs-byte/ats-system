import crypto from "node:crypto";
import { z } from "zod";
import { sys, sysTx } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit, sha256 } from "@/server/security";
import { storeCv } from "@/server/cv";
import { deleteObject } from "@/server/storage";
import { sendMail } from "@/server/mail";
import { audit } from "@/server/org";
import { cvFileName } from "@/server/cv/build";

/*
 * Public "talent network" form (e.g. linked from LinkedIn). Required: full name, email, role,
 * consent and a CV (uploaded, or built with the CV Builder). Leads go to the platform admin only.
 */
const opt = (max: number) => z.string().trim().max(max).optional();
const Fields = z.object({
  submissionKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  fullName: z.string({ error: "Enter your full name" }).trim().min(2, "Enter your full name").max(160),
  email: z.string({ error: "Enter a valid email address" }).trim().toLowerCase().email("Enter a valid email address").max(254),
  role: z.string({ error: "Enter your role" }).trim().min(2, "Enter your role").max(160),
  currentCompany: opt(160),
  phone: z.string().trim().max(40).refine((v) => !v || /^[+()\d\s.-]{6,}$/.test(v), "Enter a valid phone number").optional(),
  consent: z.literal("yes", { error: "Please confirm so we can store your details" }),
  lang: z.enum(["en", "el"]).optional(),
  utmSource: opt(80), utmMedium: opt(80), utmCampaign: opt(120),
  generatedCvToken: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).optional(),
  website: z.string().max(0, "Bot detected").optional(), // honeypot - must stay empty
});

const SOURCES: Record<string, string> = { linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", x: "X", twitter: "X", email: "Email", referral: "Referral" };

export const POST = handler(async (req) => {
  if (!rateLimit(`talent:${clientIp(req)}`, env.applyRateLimit, 60 * 60_000).ok) throw new HttpError(429, "Too many submissions from this network. Please try again later.", "rate_limited");
  const form = await req.formData();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && v !== "") raw[k] = v;
  const f = Fields.parse(raw);

  // Idempotency: a repeated submit (double click, retry) returns the original result.
  const [prior] = await sys<{ id: string }>("select id from talent_leads where submission_key = $1", [f.submissionKey]);
  if (prior) return json({ ok: true, reference: prior.id.slice(-8).toUpperCase(), duplicate: true });

  const file = form.get("cv");
  const hasFile = file instanceof File && file.size > 0;
  type Cv = { key: string; mime: string; size: number; sha256: string; fileName: string; scanStatus: string; source: "upload" | "builder"; draftId?: string };
  let cv: Cv;
  if (hasFile) {
    const s = await storeCv("talent", file as File);
    cv = { ...s, source: "upload" };
  } else if (f.generatedCvToken) {
    const [d] = await sys<{ id: string; storage_key: string; size_bytes: number; sha256: string }>(
      "select id, storage_key, size_bytes, sha256 from talent_cv_drafts where token_hash = $1 and consumed_at is null and expires_at > now()",
      [sha256(f.generatedCvToken)],
    );
    if (!d) throw new HttpError(410, "Your generated CV has expired. Generate it again, then send the form.", "cv_draft_expired", [{ path: "cv", message: "Generate your CV again" }]);
    cv = { key: d.storage_key, mime: "application/pdf", size: d.size_bytes, sha256: d.sha256, fileName: cvFileName(f.fullName), scanStatus: "not_scanned", source: "builder", draftId: d.id };
  } else {
    throw new HttpError(400, "Attach your CV (PDF or Word) or create one with the CV Builder", "cv_missing", [{ path: "cv", message: "Attach your CV" }]);
  }

  const source = (f.utmSource && SOURCES[f.utmSource.toLowerCase()]) || (f.utmSource ? f.utmSource.slice(0, 40) : "Direct");
  try {
    const id = await sysTx(async (q) => {
      if (cv.draftId) {
        const used = await q("update talent_cv_drafts set consumed_at = now() where id = $1 and consumed_at is null returning id", [cv.draftId]);
        if (!used.length) throw new HttpError(409, "This generated CV was already used. Generate it again.", "cv_draft_used");
      }
      const [row] = await q<{ id: string }>(
        `insert into talent_leads (full_name, email, current_company, role, phone, language, consent_at, source, utm_source, utm_medium, utm_campaign,
           cv_key, cv_file_name, cv_mime, cv_size, cv_sha256, cv_scan_status, cv_source, submission_key)
         values ($1,$2,$3,$4,$5,$6, now(), $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
        [f.fullName, f.email, f.currentCompany ?? "", f.role, f.phone ?? "", f.lang ?? "en", source, f.utmSource ?? null, f.utmMedium ?? null, f.utmCampaign ?? null,
          cv.key, cv.fileName, cv.mime, cv.size, cv.sha256, cv.scanStatus, cv.source, f.submissionKey],
      );
      return row.id;
    });
    await audit({ scope: "platform", action: "talent_lead.created", targetType: "talent_lead", targetId: id, metadata: { source, cvSource: cv.source }, ip: crypto.createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 16) });

    const first = f.fullName.split(/\s+/)[0];
    const el = f.lang === "el";
    const delivery = await sendMail(null, f.email,
      el ? "Λάβαμε τα στοιχεία σας - Ulysse" : "We received your details - Ulysse",
      el ? `Γεια σας ${first},\n\nΕυχαριστούμε! Λάβαμε τα στοιχεία και το βιογραφικό σας και θα επικοινωνήσουμε μαζί σας όταν μια θέση ταιριάζει στην εμπειρία σας.\n\nΑν θέλετε να διαγράψουμε τα στοιχεία σας, απαντήστε σε αυτό το email.\n\nUlysse`
         : `Hi ${first},\n\nThank you! We've received your details and CV and will be in touch when a role matches your experience.\n\nIf you'd like us to delete your details, just reply to this email.\n\nUlysse`,
      "talent_confirmation");
    for (const admin of env.platformAdminEmails) {
      await sendMail(null, admin, `New talent lead: ${f.fullName} (${source})`, `${f.fullName} - ${f.role}${f.currentCompany ? ` at ${f.currentCompany}` : ""}\nReview it in Admin → Talent leads: ${env.appUrl}/admin/talent`, "talent_notification").catch(() => {});
    }
    return json({ ok: true, reference: id.slice(-8).toUpperCase(), emailDelivery: delivery }, 201);
  } catch (e) {
    if (hasFile) await deleteObject(cv.key).catch(() => {});
    throw e;
  }
});
