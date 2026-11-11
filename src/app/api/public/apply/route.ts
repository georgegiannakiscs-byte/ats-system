import { z } from "zod";
import { sys, sysTx } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit } from "@/server/security";
import { insertCvRow, newId, storeCv } from "@/server/cv";
import { deleteObject } from "@/server/storage";
import { sendMail } from "@/server/mail";
import { sha256 } from "@/server/security";
import { createAttempt, emailInvite } from "@/server/assessments";
import { CvDataSchema, type CvData } from "@/lib/cv/schema";

/*
 * Public application intake. ONLY three fields are required: full name, email, CV.
 * Every other field is optional and validated only when supplied.
 */
const optUrl = z.string().trim().max(300).refine((v) => !v || /^https?:\/\/[^\s]+\.[^\s]+/i.test(v), "Enter a full URL starting with https://").optional();
const opt = (max: number) => z.string().trim().max(max).optional();

const Fields = z.object({
  orgSlug: z.string().min(1).max(60),
  jobSlug: z.string().min(1).max(120),
  submissionKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  fullName: z.string({ error: "Enter your full name" }).trim().min(2, "Enter your full name").max(160),
  email: z.string({ error: "Enter your email address" }).trim().toLowerCase().email("Enter a valid email address").max(254),
  phone: z.string().trim().max(40).refine((v) => !v || /^[+()\d\s.-]{6,}$/.test(v), "Enter a valid phone number").optional(),
  city: opt(120), country: opt(120), linkedinUrl: optUrl, portfolioUrl: optUrl, githubUrl: optUrl,
  currentTitle: opt(160), currentCompany: opt(160), summary: opt(4000), yearsExperience: opt(10), education: opt(2000), skills: opt(1000),
  languages: opt(500), certifications: opt(1000), salaryExpectations: opt(200), availability: opt(200), noticePeriod: opt(200), coverLetter: opt(8000), notes: opt(4000),
  utmSource: opt(80), utmMedium: opt(80), utmCampaign: opt(120), lang: z.enum(["en", "el"]).optional(),
  website: z.string().max(0, "Bot detected").optional(), // honeypot — must stay empty
  generatedCvToken: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).optional(), // CV made with the CV Builder
}).passthrough();

const SOURCE_MAP: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed", welcometothejungle: "Welcome to the Jungle", referral: "Referral" };
const list = (s?: string) => (s ? s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 40) : []);

export const POST = handler(async (req) => {
  const ip = clientIp(req);
  if (!rateLimit(`apply:${ip}`, env.applyRateLimit, 60 * 60_000).ok) throw new HttpError(429, "Too many applications from this network. Please try again later.", "rate_limited");
  const form = await req.formData();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && v !== "") raw[k] = v;
  const f = Fields.parse(raw);
  const answers = Object.entries(raw).filter(([k]) => k.startsWith("q_")).map(([k, v]) => ({ questionId: k.slice(2, 42), answer: v.slice(0, 4000) })).slice(0, 10);
  const file = form.get("cv");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !f.generatedCvToken) throw new HttpError(400, "Attach your CV (PDF or Word) or create one with the CV Builder", "cv_missing", [{ path: "cv", message: "Attach your CV (PDF or Word) or create one with the CV Builder" }]);

  const [job] = await sys<{ id: string; org_id: string; title: string; recruiter_id: string | null; org_name: string; status: string; job_status: string }>(
    `select j.id, j.org_id, j.title, j.recruiter_id, o.name as org_name, o.status, j.status as job_status from jobs j join organizations o on o.id = j.org_id
     where o.slug = $1 and j.slug = $2`,
    [f.orgSlug, f.jobSlug],
  );
  if (!job || job.status !== "active" || job.job_status !== "published") throw new HttpError(404, "This position is no longer accepting applications", "job_closed");

  // Idempotency: a repeated submit (double click, retry) returns the original result.
  const prior = await sys<{ id: string }>("select id from applications where org_id = $1 and submission_key = $2", [job.org_id, f.submissionKey]);
  if (prior.length) return json({ ok: true, reference: prior[0].id.slice(-8).toUpperCase(), duplicate: true });

  // A builder CV is validated here (before any write) and redeemed atomically in the transaction below.
  type Draft = { id: string; template: string; data: CvData; storage_key: string; photo_key: string | null; size_bytes: number; sha256: string };
  let draft: Draft | null = null;
  if (!hasFile) {
    const [d] = await sys<Draft>("select id, template, data, storage_key, photo_key, size_bytes, sha256 from cv_drafts where token_hash = $1 and org_id = $2 and job_id = $3 and consumed_at is null and expires_at > now()", [sha256(f.generatedCvToken!), job.org_id, job.id]);
    if (!d) throw new HttpError(410, "Your generated CV has expired. Generate it again, then submit.", "cv_draft_expired", [{ path: "cv", message: "Generate your CV again" }]);
    draft = { ...d, data: CvDataSchema.parse(d.data) };
  }
  const built = draft?.data;
  const cv = hasFile
    ? await storeCv(job.org_id, file as File)
    : { key: draft!.storage_key, mime: "application/pdf", size: draft!.size_bytes, sha256: draft!.sha256, fileName: `${f.fullName.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "_") || "CV"}_CV.pdf`, scanStatus: "not_scanned" as const };
  const parts = f.fullName.split(/\s+/);
  const source = (f.utmSource && SOURCE_MAP[f.utmSource.toLowerCase()]) || "Careers page";
  const extra: Record<string, string> = {};
  for (const k of ["country", "yearsExperience", "education", "certifications", "salaryExpectations", "availability", "noticePeriod", "coverLetter", "notes"] as const) if (f[k]) extra[k] = f[k]!;
  const provided: Record<string, string> = { fullName: "candidate", email: "candidate" };
  const bp = built?.personal;
  const nonEmpty = <T,>(a: T[] | undefined) => (a && a.length ? a : undefined);
  const optionalCols: [string, string, unknown][] = [
    ["phone", "phone", f.phone || bp?.phone || undefined], ["location", "location", [f.city, f.country].filter(Boolean).join(", ") || [bp?.location, bp?.country].filter(Boolean).join(", ") || undefined],
    ["headline", "headline", f.currentTitle || bp?.headline || built?.experience[0]?.title || undefined], ["currentCompany", "current_company", f.currentCompany || built?.experience.find((e) => e.current)?.company || undefined],
    ["linkedinUrl", "linkedin_url", f.linkedinUrl || bp?.linkedinUrl || undefined], ["portfolioUrl", "portfolio_url", f.portfolioUrl || bp?.portfolioUrl || undefined], ["githubUrl", "github_url", f.githubUrl], ["summary", "summary", f.summary || built?.summary || undefined],
    ["skills", "skills", f.skills ? list(f.skills) : nonEmpty(built?.skills)], ["languages", "languages", f.languages ? list(f.languages) : nonEmpty(built?.languages.map((l) => (l.level ? `${l.language} (${l.level})` : l.language)))],
    ["experience", "experience", built?.experience.length ? JSON.stringify(built.experience.map((e) => ({ title: e.title, company: e.company, start: e.start, end: e.current ? undefined : e.end || undefined, description: e.description || undefined }))) : undefined],
    ["education", "education", built?.education.length ? JSON.stringify(built.education.map((e) => ({ school: e.institution, degree: [e.degree, e.field].filter(Boolean).join(", "), year: e.end || e.start }))) : undefined],
  ];
  for (const [k, , v] of optionalCols) if (v) provided[k] = "candidate";
  for (const k of Object.keys(extra)) provided[k] = "candidate";

  try {
    const result = await sysTx(async (q) => {
      const [existing] = await q<{ id: string }>("select id from candidates where org_id = $1 and lower(email) = $2", [job.org_id, f.email]);
      let candidateId = existing?.id;
      if (!candidateId) {
        candidateId = newId("c");
        const cols = ["id", "org_id", "full_name", "first_name", "last_name", "email", "source", "hue", "extra", "field_sources"];
        const vals: unknown[] = [candidateId, job.org_id, f.fullName, parts[0], parts.slice(1).join(" "), f.email, source, Math.floor(Math.random() * 360), JSON.stringify(extra), JSON.stringify(provided)];
        for (const [, col, v] of optionalCols) if (v) { cols.push(col); vals.push(v); }
        await q(`insert into candidates (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, vals);
      } else {
        // Returning candidate: fill only empty fields; never overwrite recruiter-entered data.
        for (const [, col, v] of optionalCols) if (v) await q(`update candidates set ${col} = $2 where id = $1 and (${col} is null or ${col}::text in ('', '{}', '[]'))`, [candidateId, v]);
        await q("update candidates set extra = $2::jsonb || extra, updated_at = now() where id = $1", [candidateId, JSON.stringify(extra)]);
      }
      const active = await q<{ id: string }>("select id from applications where candidate_id = $1 and job_id = $2 and status = 'active'", [candidateId, job.id]);
      let applicationId = active[0]?.id;
      if (!applicationId) {
        applicationId = newId("a");
        await q(
          "insert into applications (id, org_id, candidate_id, job_id, recruiter_id, source, utm, answers, submission_key, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,-1)",
          [applicationId, job.org_id, candidateId, job.id, job.recruiter_id, source, JSON.stringify({ source: f.utmSource, medium: f.utmMedium, campaign: f.utmCampaign }), JSON.stringify(answers), f.submissionKey],
        );
        await q("insert into stage_history (org_id, application_id, to_stage, to_status) values ($1,$2,'applied','active')", [job.org_id, applicationId]);
      }
      if (draft) {
        const redeemed = await q("update cv_drafts set consumed_at = now() where id = $1 and consumed_at is null returning id", [draft.id]);
        if (!redeemed.length) throw new HttpError(409, "This generated CV was already used for another submission. Generate it again.", "cv_draft_used");
        const [doc] = await q<{ id: string }>(
          "insert into cv_documents (org_id, candidate_id, application_id, storage_key, file_name, mime_type, size_bytes, sha256, scan_status, source) values ($1,$2,$3,$4,$5,'application/pdf',$6,$7,'not_scanned','builder') returning id",
          [job.org_id, candidateId, applicationId, cv.key, cv.fileName, cv.size, cv.sha256],
        );
        await q("insert into cv_builder_profiles (org_id, candidate_id, application_id, cv_document_id, template, data) values ($1,$2,$3,$4,$5,$6)", [job.org_id, candidateId, applicationId, doc.id, draft.template, JSON.stringify(draft.data)]);
        if (draft.photo_key) await q("insert into candidate_photos (org_id, candidate_id, storage_key, mime_type) values ($1,$2,$3,'image/jpeg') on conflict (storage_key) do nothing", [job.org_id, candidateId, draft.photo_key]);
      } else {
        await insertCvRow(q, job.org_id, candidateId, applicationId, cv, null);
      }
      await q("insert into activities (org_id, kind, candidate_id, job_id, message) values ($1,'applied',$2,$3,$4)", [job.org_id, candidateId, job.id, `applied for ${job.title}${source !== "Careers page" ? ` via ${source}` : ""}`]);
      if (job.recruiter_id) {
        await q("insert into workspace_records (org_id, kind, id, data) values ($1,'notification',$2,$3)", [
          job.org_id, newId("no"), JSON.stringify({ userId: job.recruiter_id, title: "New application", body: `${f.fullName} applied for ${job.title}.`, href: `/candidates/view?id=${candidateId}`, createdAt: new Date().toISOString(), read: false }),
        ]);
      }
      // Optional Quick Check: invitation created only when the job has an approved, enabled set.
      const quickCheck = await createAttempt(q, { orgId: job.org_id, applicationId, jobId: job.id, candidateId, invitedBy: null });
      return { applicationId, quickCheck };
    });
    const lang = f.lang ?? "en";
    const subject = lang === "el" ? `Λάβαμε την αίτησή σας — ${job.title}` : `We received your application — ${job.title}`;
    const body = lang === "el"
      ? `Γεια σας ${parts[0]},\n\nΕυχαριστούμε για την αίτησή σας για τη θέση ${job.title} στην ${job.org_name}. Θα επικοινωνήσουμε μαζί σας σύντομα.\n\n${job.org_name}`
      : `Hi ${parts[0]},\n\nThank you for applying for ${job.title} at ${job.org_name}. We'll be in touch soon.\n\n${job.org_name}`;
    const delivery = await sendMail(job.org_id, f.email, subject, body, "application_confirmation");
    const qc = result.quickCheck;
    if (qc?.config.allowLater) await emailInvite(job.org_id, f.email, parts[0], job.title, job.org_name, qc.token, lang).catch(() => {});
    return json({
      ok: true, reference: result.applicationId.slice(-8).toUpperCase(), emailDelivery: delivery, cvSource: draft ? "builder" : "upload",
      quickCheck: qc ? { token: qc.token, questions: qc.count, timed: qc.config.timed, secondsPerQuestion: qc.config.secondsPerQuestion, allowLater: qc.config.allowLater } : null,
    }, 201);
  } catch (e) {
    if (hasFile) await deleteObject(cv.key).catch(() => {});
    throw e;
  }
});
