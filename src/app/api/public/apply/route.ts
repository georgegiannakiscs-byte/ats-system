import { z } from "zod";
import { sys, sysTx } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, clientIp, handler, json } from "@/server/http";
import { rateLimit } from "@/server/security";
import { insertCvRow, newId, storeCv } from "@/server/cv";
import { deleteObject } from "@/server/storage";
import { sendMail } from "@/server/mail";

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
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Attach your CV (PDF or Word)", "cv_missing", [{ path: "cv", message: "Attach your CV (PDF or Word)" }]);

  const [job] = await sys<{ id: string; org_id: string; title: string; recruiter_id: string | null; org_name: string; status: string; job_status: string }>(
    `select j.id, j.org_id, j.title, j.recruiter_id, o.name as org_name, o.status, j.status as job_status from jobs j join organizations o on o.id = j.org_id
     where o.slug = $1 and j.slug = $2`,
    [f.orgSlug, f.jobSlug],
  );
  if (!job || job.status !== "active" || job.job_status !== "published") throw new HttpError(404, "This position is no longer accepting applications", "job_closed");

  // Idempotency: a repeated submit (double click, retry) returns the original result.
  const prior = await sys<{ id: string }>("select id from applications where org_id = $1 and submission_key = $2", [job.org_id, f.submissionKey]);
  if (prior.length) return json({ ok: true, reference: prior[0].id.slice(-8).toUpperCase(), duplicate: true });

  const cv = await storeCv(job.org_id, file);
  const parts = f.fullName.split(/\s+/);
  const source = (f.utmSource && SOURCE_MAP[f.utmSource.toLowerCase()]) || "Careers page";
  const extra: Record<string, string> = {};
  for (const k of ["country", "yearsExperience", "education", "certifications", "salaryExpectations", "availability", "noticePeriod", "coverLetter", "notes"] as const) if (f[k]) extra[k] = f[k]!;
  const provided: Record<string, string> = { fullName: "candidate", email: "candidate" };
  const optionalCols: [string, string, unknown][] = [
    ["phone", "phone", f.phone], ["location", "location", [f.city, f.country].filter(Boolean).join(", ") || undefined], ["headline", "headline", f.currentTitle], ["currentCompany", "current_company", f.currentCompany],
    ["linkedinUrl", "linkedin_url", f.linkedinUrl], ["portfolioUrl", "portfolio_url", f.portfolioUrl], ["githubUrl", "github_url", f.githubUrl], ["summary", "summary", f.summary],
    ["skills", "skills", f.skills ? list(f.skills) : undefined], ["languages", "languages", f.languages ? list(f.languages) : undefined],
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
        for (const [, col, v] of optionalCols) if (v) await q(`update candidates set ${col} = $2 where id = $1 and (${col} is null or ${col}::text in ('', '{}'))`, [candidateId, v]);
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
      await insertCvRow(q, job.org_id, candidateId, applicationId, cv, null);
      await q("insert into activities (org_id, kind, candidate_id, job_id, message) values ($1,'applied',$2,$3,$4)", [job.org_id, candidateId, job.id, `applied for ${job.title}${source !== "Careers page" ? ` via ${source}` : ""}`]);
      if (job.recruiter_id) {
        await q("insert into workspace_records (org_id, kind, id, data) values ($1,'notification',$2,$3)", [
          job.org_id, newId("no"), JSON.stringify({ userId: job.recruiter_id, title: "New application", body: `${f.fullName} applied for ${job.title}.`, href: `/candidates/view?id=${candidateId}`, createdAt: new Date().toISOString(), read: false }),
        ]);
      }
      return { applicationId };
    });
    const lang = f.lang ?? "en";
    const subject = lang === "el" ? `Λάβαμε την αίτησή σας — ${job.title}` : `We received your application — ${job.title}`;
    const body = lang === "el"
      ? `Γεια σας ${parts[0]},\n\nΕυχαριστούμε για την αίτησή σας για τη θέση ${job.title} στην ${job.org_name}. Θα επικοινωνήσουμε μαζί σας σύντομα.\n\n${job.org_name}`
      : `Hi ${parts[0]},\n\nThank you for applying for ${job.title} at ${job.org_name}. We'll be in touch soon.\n\n${job.org_name}`;
    const delivery = await sendMail(job.org_id, f.email, subject, body, "application_confirmation");
    return json({ ok: true, reference: result.applicationId.slice(-8).toUpperCase(), emailDelivery: delivery }, 201);
  } catch (e) {
    await deleteObject(cv.key).catch(() => {});
    throw e;
  }
});
