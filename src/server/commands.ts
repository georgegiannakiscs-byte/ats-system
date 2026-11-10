import "server-only";
import { z } from "zod";
import { sys, tenantTx, type Q } from "./db";
import { HttpError } from "./http";
import { audit, slugify, type OrgAccess } from "./org";
import { can, ROLE_FROM_LABEL, type Permission } from "./permissions";

/*
 * Every write from the workspace UI goes through here. Each command:
 *  1. checks the caller's permission in THIS company,
 *  2. validates its payload,
 *  3. runs inside tenantTx (RLS-restricted to the company).
 */

const Id = z.string().regex(/^[a-z]+_[A-Za-z0-9]{3,48}$/, "Invalid id");
const Str = (max = 500) => z.string().trim().max(max);
const STAGES = ["applied", "screening", "hr_interview", "hm_interview", "technical", "final_review", "offer", "hired"] as const;
const Stage = z.enum(STAGES);
const JobStatus = z.enum(["draft", "published", "on_hold", "closed", "archived"]);
const RECORD_KINDS = { interview: "interviews.manage", scorecard: "feedback.submit", task: "tasks.manage", talent_list: "candidates.view", saved_view: "candidates.view", email_template: "settings.manage", notification: "workspace.view" } as const satisfies Record<string, Permission>;

// No .default()s: with Zod v4 defaults also fire inside .partial(), which would wipe fields on
// partial updates. Missing fields on insert fall back to the database column defaults.
const JobInput = z.object({
  title: Str(160).min(2),
  department: Str(80).optional(),
  location: Str(120).optional(),
  workplace: z.enum(["On-site", "Hybrid", "Remote"]).optional(),
  employmentType: z.enum(["Full-time", "Part-time", "Contract", "Internship"]).optional(),
  contractType: Str(80).optional(),
  seniority: z.enum(["Junior", "Mid-level", "Senior", "Lead", "Principal"]).optional(),
  status: JobStatus.optional(),
  hiringManagerId: z.string().optional().nullable(),
  recruiterId: z.string().optional().nullable(),
  openings: z.number().int().min(1).max(500).optional(),
  salaryMin: z.number().int().min(0).max(10_000_000).optional().nullable(),
  salaryMax: z.number().int().min(0).max(10_000_000).optional().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  summary: Str(4000).optional(),
  responsibilities: Str(8000).optional(),
  requirements: Str(8000).optional(),
  requiredExperience: Str(1000).optional(),
  benefits: Str(4000).optional(),
  skills: z.array(Str(60)).max(40).optional(),
  preferredSkills: z.array(Str(60)).max(40).optional(),
  // Screening questions are always optional for candidates — "required" is not accepted.
  screeningQuestions: z.array(z.object({ id: z.string().max(40), label: Str(300).min(2), type: z.enum(["text", "yesno"]) })).max(10).optional(),
  channels: z.object({ careersPage: z.boolean(), linkedin: z.boolean(), indeed: z.boolean() }).partial().optional(),
  targetHireDate: z.string().datetime().optional().nullable(),
});

const CandidatePatch = z.object({
  fullName: Str(160).min(1), firstName: Str(80), lastName: Str(80), email: z.string().trim().email().max(254), phone: Str(40), location: Str(120), headline: Str(160), currentCompany: Str(160),
  linkedinUrl: z.string().trim().url().max(300).or(z.literal("")), portfolioUrl: z.string().trim().url().max(300).or(z.literal("")), githubUrl: z.string().trim().url().max(300).or(z.literal("")),
  source: Str(60), tags: z.array(Str(60)).max(40), skills: z.array(Str(60)).max(80), languages: z.array(Str(40)).max(20), summary: Str(4000),
  extra: z.record(z.string(), z.unknown()), inTalentPool: z.boolean(),
}).partial();

const COLS: Record<string, string> = {
  fullName: "full_name", firstName: "first_name", lastName: "last_name", email: "email", phone: "phone", location: "location", headline: "headline", currentCompany: "current_company",
  linkedinUrl: "linkedin_url", portfolioUrl: "portfolio_url", githubUrl: "github_url", source: "source", tags: "tags", skills: "skills", languages: "languages", summary: "summary", extra: "extra", inTalentPool: "in_talent_pool",
};

const JOB_COLS: Record<string, string> = {
  title: "title", department: "department", location: "location", workplace: "workplace", employmentType: "employment_type", contractType: "contract_type", seniority: "seniority", status: "status",
  hiringManagerId: "hiring_manager_id", recruiterId: "recruiter_id", openings: "openings", salaryMin: "salary_min", salaryMax: "salary_max", currency: "currency", summary: "summary",
  responsibilities: "responsibilities", requirements: "requirements", requiredExperience: "required_experience", benefits: "benefits", skills: "skills", preferredSkills: "preferred_skills",
  screeningQuestions: "screening_questions", channels: "channels", targetHireDate: "target_hire_date",
};
const JSON_COLS = new Set(["screening_questions", "channels", "extra"]);

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

async function activity(q: Q, a: OrgAccess, kind: string, message: string, refs: { candidateId?: string; jobId?: string } = {}) {
  await q("insert into activities (org_id, kind, actor_id, candidate_id, job_id, message) values ($1,$2,$3,$4,$5,$6)", [a.org.id, kind, a.user.id, refs.candidateId ?? null, refs.jobId ?? null, message]);
}

async function teamIds(orgId: string) {
  return (await sys<{ user_id: string }>("select user_id from memberships where org_id = $1 and status = 'active'", [orgId])).map((r) => r.user_id);
}

function need(a: OrgAccess, p: Permission) {
  if (!can(a.role, p)) throw new HttpError(403, "You don't have permission to do that in this company", "forbidden");
}

async function uniqueJobSlug(q: Q, title: string, excludeId?: string) {
  const root = slugify(title).slice(0, 60) || "job";
  for (let i = 0; i < 100; i++) {
    const s = i === 0 ? root : `${root}-${i + 1}`;
    const rows = await q("select 1 from jobs where slug = $1 and id <> coalesce($2, '')", [s, excludeId ?? null]);
    if (!rows.length) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

function jobAssignments(cols: string[], vals: unknown[], data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    const col = JOB_COLS[k];
    if (!col || v === undefined) continue;
    cols.push(col);
    vals.push(JSON_COLS.has(col) ? JSON.stringify(v) : v === "" && (col.endsWith("_id")) ? null : v);
  }
}

async function moveApplication(q: Q, a: OrgAccess, id: string, stage: (typeof STAGES)[number], index?: number) {
  const [app] = await q<{ id: string; stage: string; status: string; job_id: string; candidate_id: string; evaluation: string }>("select id, stage, status, job_id, candidate_id, evaluation from applications where id = $1 for update", [id]);
  if (!app) throw new HttpError(404, "Application not found", "not_found");
  const changed = app.stage !== stage || app.status === "hired" !== (stage === "hired");
  const column = (await q<{ id: string }>("select id from applications where job_id = $1 and stage = $2 and id <> $3 and status <> 'rejected' and status <> 'withdrawn' order by sort_order, applied_at", [app.job_id, stage, id])).map((r) => r.id);
  column.splice(Math.max(0, Math.min(index ?? column.length, column.length)), 0, id);
  for (const [i, aid] of column.entries()) await q("update applications set sort_order = $1 where id = $2", [i, aid]);
  const newStatus = stage === "hired" ? "hired" : "active";
  await q(
    `update applications set stage = $2, status = $3, stage_entered_at = case when $4 then now() else stage_entered_at end,
       evaluation = case when $4 and evaluation = 'none' then 'pending' else evaluation end where id = $1`,
    [id, stage, newStatus, changed],
  );
  if (changed) {
    await q("insert into stage_history (org_id, application_id, from_stage, to_stage, from_status, to_status, changed_by) values ($1,$2,$3,$4,$5,$6,$7)", [a.org.id, id, app.stage, stage, app.status, newStatus, a.user.id]);
    const [c] = await q<{ full_name: string }>("select full_name from candidates where id = $1", [app.candidate_id]);
    const [j] = await q<{ title: string }>("select title from jobs where id = $1", [app.job_id]);
    const [s] = await q<{ label: string }>("select label from pipeline_stages where stage_key = $1", [stage]);
    await activity(q, a, stage === "hired" ? "hired" : "stage_changed", stage === "hired" ? `marked ${c?.full_name} as hired for ${j?.title}` : `moved ${c?.full_name} to ${s?.label ?? stage}`, { candidateId: app.candidate_id, jobId: app.job_id });
  }
}

export async function runCommand(a: OrgAccess, type: string, p: Record<string, unknown>) {
  const orgId = a.org.id;

  /* ── Settings & team (owner-level tables, explicit org scoping) ── */
  if (type === "settings.company") {
    need(a, "settings.manage");
    const v = z.object({ name: Str(120).min(2), legalName: Str(160), website: Str(300), industry: Str(120), size: Str(60), headquarters: Str(160), about: Str(4000), careersUrl: Str(300), contactEmail: Str(254), phone: Str(40), linkedin: Str(300), twitter: Str(300), instagram: Str(300) }).partial().parse(p);
    const { name, ...profile } = v;
    await sys("update organizations set name = coalesce($2, name), profile = profile || $3::jsonb where id = $1", [orgId, name ?? null, JSON.stringify(profile)]);
    await audit({ scope: "org", action: "company.profile_updated", actorId: a.user.id, orgId, metadata: { fields: Object.keys(v) } });
    return;
  }
  if (type === "settings.branding") {
    need(a, "branding.manage");
    const v = z.object({
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), careersIntro: Str(2000), careersHeadline: Str(160), benefits: z.array(Str(160)).max(12),
      careersLanguage: z.enum(["en", "el"]), careersLayout: z.enum(["list", "grid"]),
    }).partial().parse(p);
    await sys("update organizations set branding = branding || $2::jsonb where id = $1", [orgId, JSON.stringify(v)]);
    await audit({ scope: "org", action: "company.branding_updated", actorId: a.user.id, orgId, metadata: { fields: Object.keys(v) } });
    return;
  }
  if (type === "settings.onboarding") {
    const v = z.object({ step: z.string().max(40), done: z.boolean() }).parse(p);
    await sys("update organizations set onboarding = onboarding || jsonb_build_object($2::text, $3::boolean) where id = $1", [orgId, v.step, v.done]);
    return;
  }
  if (type === "settings.notificationPrefs") {
    need(a, "settings.manage");
    const v = z.record(z.string().max(40), z.boolean()).parse(p);
    await sys("update organizations set notification_prefs = notification_prefs || $2::jsonb where id = $1", [orgId, JSON.stringify(v)]);
    return;
  }
  if (type === "team.updateRole") {
    need(a, "team.manage");
    const v = z.object({ userId: z.string().uuid(), role: z.enum(["Admin", "Recruiter", "Hiring Manager", "Interviewer"]) }).parse(p);
    const role = ROLE_FROM_LABEL[v.role];
    if (role !== "admin") {
      const admins = await sys<{ user_id: string }>("select user_id from memberships where org_id = $1 and role = 'admin' and status = 'active'", [orgId]);
      if (admins.length === 1 && admins[0].user_id === v.userId) throw new HttpError(400, "A company needs at least one admin", "last_admin");
    }
    await sys("update memberships set role = $3 where org_id = $1 and user_id = $2", [orgId, v.userId, role]);
    await audit({ scope: "org", action: "member.role_changed", actorId: a.user.id, orgId, targetType: "user", targetId: v.userId, metadata: { role } });
    return;
  }
  if (type === "team.remove") {
    need(a, "team.manage");
    const v = z.object({ userId: z.string().uuid() }).parse(p);
    if (v.userId === a.user.id) throw new HttpError(400, "You can't remove yourself", "validation");
    await sys("update memberships set status = 'removed' where org_id = $1 and user_id = $2", [orgId, v.userId]);
    await audit({ scope: "org", action: "member.removed", actorId: a.user.id, orgId, targetType: "user", targetId: v.userId });
    return;
  }

  /* ── Tenant data (RLS) ── */
  return tenantTx(orgId, a.user.id, async (q) => {
    switch (type) {
      case "settings.stages": {
        need(a, "settings.manage");
        const v = z.array(z.object({ id: Stage, label: Str(60).min(1), description: Str(200), slaDays: z.number().int().min(0).max(90) })).length(8).parse(p.stages);
        for (const s of v) await q("update pipeline_stages set label = $2, description = $3, sla_days = $4 where stage_key = $1", [s.id, s.label, s.description, s.slaDays]);
        return;
      }
      case "jobs.create": {
        need(a, "jobs.manage");
        const id = Id.parse(p.id);
        const v = JobInput.parse(p.input);
        const team = await teamIds(orgId);
        if (v.hiringManagerId && !team.includes(v.hiringManagerId)) throw new HttpError(400, "Hiring manager must be a member of this company", "validation");
        if (v.recruiterId && !team.includes(v.recruiterId)) throw new HttpError(400, "Recruiter must be a member of this company", "validation");
        if (v.salaryMin && v.salaryMax && v.salaryMin > v.salaryMax) throw new HttpError(400, "Salary range is invalid", "validation");
        const cols = ["id", "org_id", "slug", "created_by"];
        const vals: unknown[] = [id, orgId, await uniqueJobSlug(q, v.title), a.user.id];
        jobAssignments(cols, vals, v);
        if (v.status === "published") { cols.push("published_at"); vals.push(new Date().toISOString()); }
        await q(`insert into jobs (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, vals);
        await activity(q, a, "job_created", `created the job ${v.title}`, { jobId: id });
        return;
      }
      case "jobs.update": {
        need(a, "jobs.manage");
        const id = Id.parse(p.id);
        const v = JobInput.partial().parse(p.patch);
        const team = await teamIds(orgId);
        for (const k of ["hiringManagerId", "recruiterId"] as const) if (v[k] && !team.includes(v[k]!)) throw new HttpError(400, "Assignee must be a member of this company", "validation");
        const cols: string[] = [];
        const vals: unknown[] = [];
        jobAssignments(cols, vals, v);
        if (!cols.length) return;
        const sets = cols.map((c, i) => `${c} = $${i + 2}`);
        if (v.status === "published") sets.push("published_at = coalesce(published_at, now())");
        const rows = await q<{ title: string }>(`update jobs set ${sets.join(", ")} where id = $1 returning title`, [id, ...vals]);
        if (!rows.length) throw new HttpError(404, "Job not found", "not_found");
        await activity(q, a, v.status === "published" ? "job_published" : "job_updated", v.status === "published" ? `published ${rows[0].title}` : `updated ${rows[0].title}`, { jobId: id });
        return;
      }
      case "jobs.remove": {
        need(a, "jobs.manage");
        const rows = await q("delete from jobs where id = $1 returning id", [Id.parse(p.id)]);
        if (!rows.length) throw new HttpError(404, "Job not found", "not_found");
        return;
      }
      case "applications.move": {
        need(a, "pipeline.move");
        await moveApplication(q, a, Id.parse(p.id), Stage.parse(p.stage), p.index === undefined ? undefined : z.number().int().min(0).parse(p.index));
        return;
      }
      case "applications.reject":
      case "applications.withdraw": {
        need(a, "pipeline.move");
        const id = Id.parse(p.id);
        const reason = Str(300).min(1).parse(p.reason);
        const withdraw = type === "applications.withdraw";
        const [app] = await q<{ candidate_id: string; job_id: string; stage: string; status: string }>("select candidate_id, job_id, stage, status from applications where id = $1", [id]);
        if (!app) throw new HttpError(404, "Application not found", "not_found");
        await q(withdraw ? "update applications set status = 'withdrawn', withdrawal_reason = $2, stage_entered_at = now() where id = $1" : "update applications set status = 'rejected', rejection_reason = $2, stage_entered_at = now() where id = $1", [id, reason]);
        await q("insert into stage_history (org_id, application_id, from_stage, to_stage, from_status, to_status, changed_by) values ($1,$2,$3,$3,$4,$5,$6)", [orgId, id, app.stage, app.status, withdraw ? "withdrawn" : "rejected", a.user.id]);
        if (p.addToPool) await q("update candidates set in_talent_pool = true where id = $1", [app.candidate_id]);
        const [c] = await q<{ full_name: string }>("select full_name from candidates where id = $1", [app.candidate_id]);
        await activity(q, a, "rejected", withdraw ? `recorded that ${c?.full_name} withdrew — ${reason}` : `rejected ${c?.full_name} — ${reason}`, { candidateId: app.candidate_id, jobId: app.job_id });
        return;
      }
      case "applications.restore": {
        need(a, "pipeline.move");
        const id = Id.parse(p.id);
        const [app] = await q<{ stage: string; status: string }>("select stage, status from applications where id = $1", [id]);
        if (!app) throw new HttpError(404, "Application not found", "not_found");
        await q("update applications set status = 'active', rejection_reason = null, withdrawal_reason = null where id = $1", [id]);
        await q("insert into stage_history (org_id, application_id, from_stage, to_stage, from_status, to_status, changed_by) values ($1,$2,$3,$3,$4,'active',$5)", [orgId, id, app.stage, app.status, a.user.id]);
        return;
      }
      case "applications.setRecruiter": {
        need(a, "pipeline.move");
        const rid = z.string().uuid().parse(p.recruiterId);
        if (!(await teamIds(orgId)).includes(rid)) throw new HttpError(400, "Recruiter must be a member of this company", "validation");
        await q("update applications set recruiter_id = $2 where id = $1", [Id.parse(p.id), rid]);
        return;
      }
      case "applications.create": {
        need(a, "pipeline.move");
        const id = Id.parse(p.id);
        const candidateId = Id.parse(p.candidateId);
        const jobId = Id.parse(p.jobId);
        const dup = await q("select 1 from applications where candidate_id = $1 and job_id = $2 and status = 'active'", [candidateId, jobId]);
        if (dup.length) throw new HttpError(409, "Candidate is already in this job's pipeline", "conflict");
        const [job] = await q<{ recruiter_id: string | null; title: string }>("select recruiter_id, title from jobs where id = $1", [jobId]);
        const [cand] = await q<{ full_name: string; source: string }>("select full_name, source from candidates where id = $1", [candidateId]);
        if (!job || !cand) throw new HttpError(404, "Job or candidate not found", "not_found");
        await q("insert into applications (id, org_id, candidate_id, job_id, recruiter_id, source, sort_order) values ($1,$2,$3,$4,$5,$6,-1)", [id, orgId, candidateId, jobId, job.recruiter_id ?? a.user.id, cand.source]);
        await activity(q, a, "applied", `added ${cand.full_name} to ${job.title}`, { candidateId, jobId });
        return;
      }
      case "candidates.create": {
        need(a, "candidates.edit");
        const id = Id.parse(p.id);
        const v = CandidatePatch.required({ fullName: true, email: true }).parse(p.input);
        const exists = await q<{ id: string }>("select id from candidates where lower(email) = lower($1)", [v.email]);
        if (exists.length) throw new HttpError(409, "A candidate with this email already exists in this company", "duplicate", { candidateId: exists[0].id });
        const { first, last } = splitName(v.fullName);
        const sources: Record<string, string> = {};
        const cols = ["id", "org_id", "first_name", "last_name", "hue", "field_sources", "in_talent_pool"];
        const vals: unknown[] = [id, orgId, v.firstName ?? first, v.lastName ?? last, Math.floor(Math.random() * 360), "{}", !p.jobId];
        for (const [k, val] of Object.entries(v)) {
          if (!COLS[k] || k === "firstName" || k === "lastName" || k === "inTalentPool" || val === undefined) continue;
          cols.push(COLS[k]);
          vals.push(JSON_COLS.has(COLS[k]) ? JSON.stringify(val) : val === "" && k.endsWith("Url") ? null : val);
          sources[k] = "recruiter";
        }
        vals[5] = JSON.stringify(sources);
        await q(`insert into candidates (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, vals);
        await activity(q, a, "candidate_updated", `added ${v.fullName}`, { candidateId: id });
        if (p.jobId) {
          const jobId = Id.parse(p.jobId);
          const [job] = await q<{ recruiter_id: string | null; title: string }>("select recruiter_id, title from jobs where id = $1", [jobId]);
          if (!job) throw new HttpError(404, "Job not found", "not_found");
          await q("insert into applications (id, org_id, candidate_id, job_id, recruiter_id, source, sort_order) values ($1,$2,$3,$4,$5,$6,-1)", [Id.parse(p.applicationId), orgId, id, jobId, job.recruiter_id ?? a.user.id, v.source ?? "Sourced"]);
          await activity(q, a, "applied", `added ${v.fullName} to ${job.title}`, { candidateId: id, jobId });
        }
        return;
      }
      case "candidates.update": {
        need(a, "candidates.edit");
        const id = Id.parse(p.id);
        const v = CandidatePatch.parse(p.patch);
        const sets: string[] = [];
        const vals: unknown[] = [id];
        const touched: Record<string, string> = {};
        for (const [k, val] of Object.entries(v)) {
          if (!COLS[k] || val === undefined) continue;
          vals.push(JSON_COLS.has(COLS[k]) ? JSON.stringify(val) : val === "" && k.endsWith("Url") ? null : val);
          sets.push(k === "extra" ? `extra = extra || $${vals.length}::jsonb` : `${COLS[k]} = $${vals.length}`);
          if (k !== "inTalentPool") touched[k] = "recruiter";
        }
        if (v.fullName && !v.firstName) {
          const { first, last } = splitName(v.fullName);
          vals.push(first, last);
          sets.push(`first_name = $${vals.length - 1}`, `last_name = $${vals.length}`);
        }
        if (!sets.length) return;
        vals.push(JSON.stringify(touched));
        sets.push(`field_sources = field_sources || $${vals.length}::jsonb`, "updated_at = now()");
        const rows = await q<{ full_name: string }>(`update candidates set ${sets.join(", ")} where id = $1 returning full_name`, vals);
        if (!rows.length) throw new HttpError(404, "Candidate not found", "not_found");
        await activity(q, a, "candidate_updated", `updated ${rows[0].full_name}'s profile (${Object.keys(touched).join(", ") || "talent pool"})`, { candidateId: id });
        return;
      }
      case "candidates.bulk": {
        need(a, "candidates.edit");
        const ids = z.array(Id).max(500).parse(p.ids);
        if (p.inTalentPool !== undefined) await q("update candidates set in_talent_pool = $2 where id = any($1)", [ids, z.boolean().parse(p.inTalentPool)]);
        if (p.addTags) await q("update candidates set tags = (select array(select distinct unnest(tags || $2::text[]))) where id = any($1)", [ids, z.array(Str(60)).parse(p.addTags)]);
        return;
      }
      case "notes.add": {
        need(a, "notes.write");
        const candidateId = Id.parse(p.candidateId);
        await q("insert into notes (id, org_id, candidate_id, author_id, body) values ($1,$2,$3,$4,$5)", [Id.parse(p.id), orgId, candidateId, a.user.id, Str(10000).min(1).parse(p.body)]);
        await activity(q, a, "note_added", "added a note", { candidateId });
        return;
      }
      case "notes.update":
      case "notes.remove": {
        need(a, "notes.write");
        const id = Id.parse(p.id);
        const [n] = await q<{ author_id: string }>("select author_id from notes where id = $1", [id]);
        if (!n) throw new HttpError(404, "Note not found", "not_found");
        const onlyPin = type === "notes.update" && p.body === undefined;
        if (n.author_id !== a.user.id && a.role !== "admin" && !onlyPin) throw new HttpError(403, "You can only change your own notes", "forbidden");
        if (type === "notes.remove") await q("delete from notes where id = $1", [id]);
        else await q("update notes set body = coalesce($2, body), pinned = coalesce($3, pinned) where id = $1", [id, p.body === undefined ? null : Str(10000).min(1).parse(p.body), p.pinned === undefined ? null : z.boolean().parse(p.pinned)]);
        return;
      }
      case "records.upsert":
      case "records.delete": {
        const kind = z.enum(Object.keys(RECORD_KINDS) as [keyof typeof RECORD_KINDS]).parse(p.kind);
        need(a, RECORD_KINDS[kind]);
        const id = z.string().regex(/^[a-z]+_[A-Za-z0-9]{2,48}$/).parse(p.id);
        if (type === "records.delete") {
          await q("delete from workspace_records where kind = $1 and id = $2", [kind, id]);
          return;
        }
        const data = z.record(z.string(), z.unknown()).parse(p.data);
        if (JSON.stringify(data).length > 100_000) throw new HttpError(413, "Record too large", "too_large");
        if (kind === "saved_view") data.userId = a.user.id;
        await q("insert into workspace_records (org_id, kind, id, data) values ($1,$2,$3,$4) on conflict (org_id, kind, id) do update set data = excluded.data, updated_at = now()", [orgId, kind, id, JSON.stringify(data)]);
        if (kind === "interview" && p.activity) await activity(q, a, "interview_scheduled", Str(300).parse(p.activity), { candidateId: data.candidateId as string, jobId: data.jobId as string });
        return;
      }
      case "scorecards.submit": {
        need(a, "feedback.submit");
        const card = z.object({ id: Id, candidateId: Id, jobId: Id, interviewId: z.string().optional(), recommendation: z.enum(["strong_no", "no", "yes", "strong_yes"]) }).passthrough().parse(p.card);
        await q("insert into workspace_records (org_id, kind, id, data) values ($1,'scorecard',$2,$3)", [orgId, card.id, JSON.stringify({ ...card, authorId: a.user.id, submittedAt: new Date().toISOString() })]);
        if (card.interviewId) await q("update workspace_records set data = jsonb_set(data, '{status}', '\"completed\"') where kind = 'interview' and id = $1 and data->>'status' = 'scheduled'", [card.interviewId]);
        const ev = card.recommendation.endsWith("yes") ? "positive" : "negative";
        await q("update applications set evaluation = case when evaluation = 'positive' and $3 = 'negative' then 'mixed' else $3 end where candidate_id = $1 and job_id = $2", [card.candidateId, card.jobId, ev]);
        await activity(q, a, "scorecard_submitted", "submitted a scorecard", { candidateId: card.candidateId, jobId: card.jobId });
        return;
      }
      case "activity.log": {
        need(a, "candidates.view");
        await activity(q, a, z.enum(["email_drafted", "task_completed"]).parse(p.kind), Str(300).parse(p.message), { candidateId: p.candidateId ? Id.parse(p.candidateId) : undefined, jobId: p.jobId ? Id.parse(p.jobId) : undefined });
        return;
      }
      default:
        throw new HttpError(400, `Unknown command ${type}`, "unknown_command");
    }
  });
}
