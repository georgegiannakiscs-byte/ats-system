import "server-only";
import { sys, tenantTx, type Q } from "./db";
import { HttpError } from "./http";
import { ROLE_LABEL, permissionsFor, type OrgRole } from "./permissions";
import type { OrgAccess } from "./org";
import { aiAndCvSettings, assessmentSnapshot } from "./assessment-snapshot";

/* Default configuration for a brand-new company workspace. */
export const DEFAULT_STAGES = [
  ["applied", "Applied", "New applications awaiting review", 3],
  ["screening", "HR Screening", "CV and motivation review", 4],
  ["hr_interview", "HR Interview", "First conversation with Talent", 5],
  ["hm_interview", "Hiring Manager", "Interview with the hiring manager", 6],
  ["technical", "Technical Assessment", "Case study or technical exercise", 7],
  ["final_review", "Final Review", "Debrief and final decision", 4],
  ["offer", "Offer", "Offer prepared, sent or negotiated", 5],
  ["hired", "Hired", "Offer accepted", 0],
] as const;

export const DEFAULT_TEMPLATES = [
  { id: "tpl_ack", name: "Application received", category: "Application", subject: "Thank you for applying to {{job_title}}", body: "Hi {{candidate_name}},\n\nThank you for your interest in the {{job_title}} role at {{company_name}}. We're reviewing your application and will be in touch soon.\n\nKind regards,\n{{recruiter_name}}" },
  { id: "tpl_invite", name: "Interview invitation", category: "Interview", subject: "Interview — {{job_title}} at {{company_name}}", body: "Hi {{candidate_name}},\n\nWe'd love to invite you to an interview on {{interview_date}}.\n\nBest,\n{{recruiter_name}}" },
  { id: "tpl_reject", name: "Rejection — after review", category: "Rejection", subject: "Your application for {{job_title}}", body: "Hi {{candidate_name}},\n\nThank you for applying. After careful consideration we've decided to move forward with other candidates.\n\nKind regards,\n{{recruiter_name}}" },
];

export const DEFAULT_NOTIFICATION_PREFS = { newApplication: true, stageChange: true, interviewReminder: true, scorecardDue: true, taskDue: true, weeklyDigest: false, mentions: true };

export async function initialiseOrg(q: Q, orgId: string) {
  for (const [i, s] of DEFAULT_STAGES.entries()) {
    await q("insert into pipeline_stages (org_id, stage_key, label, description, sla_days, position) values ($1,$2,$3,$4,$5,$6)", [orgId, s[0], s[1], s[2], s[3], i]);
  }
  for (const t of DEFAULT_TEMPLATES) {
    await q("insert into workspace_records (org_id, kind, id, data) values ($1,'email_template',$2,$3)", [orgId, t.id, JSON.stringify({ ...t, updatedAt: new Date().toISOString() })]);
  }
}

export function hueFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export { logoUrl } from "./branding";
import { logoUrl } from "./branding";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);

/** Builds the workspace payload consumed by the frontend store — one company only. */
export async function buildSnapshot(access: OrgAccess) {
  const { org, user, role } = access;
  const [orgRow] = await sys<{ profile: Record<string, unknown>; branding: Record<string, unknown>; onboarding: Record<string, unknown>; notification_prefs: Record<string, boolean>; name: string }>(
    "select name, profile, branding, onboarding, notification_prefs from organizations where id = $1",
    [org.id],
  );
  const team = await sys<{ id: string; name: string; email: string; role: OrgRole; title: string | null }>(
    "select u.id, u.name, u.email, m.role, m.title from memberships m join users u on u.id = m.user_id where m.org_id = $1 and m.status = 'active' order by m.created_at",
    [org.id],
  );
  const invitations = role === "admin"
    ? await sys<{ id: string; email: string; role: OrgRole; created_at: Date; expires_at: Date }>("select id, email, role, created_at, expires_at from invitations where org_id = $1 and accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc", [org.id])
    : [];
  const integrations = await sys<{ provider: string; status: string }>("select provider, status from integrations where org_id = $1", [org.id]);
  const features = await sys<{ key: string; enabled: boolean }>("select f.key, coalesce(of.enabled, f.default_enabled) as enabled from feature_flags f left join org_features of on of.feature_key = f.key and of.org_id = $1", [org.id]);

  const data = await tenantTx(org.id, user.id, async (q) => {
    const stages = await q("select stage_key, label, description, sla_days from pipeline_stages order by position");
    const jobs = await q("select * from jobs order by created_at desc");
    const candidates = await q("select * from candidates order by created_at desc");
    const applications = await q("select * from applications order by applied_at desc");
    const notes = await q("select * from notes order by created_at desc");
    const activities = await q("select * from activities order by created_at desc limit 400");
    const records = await q<{ kind: string; id: string; data: Record<string, unknown> }>("select kind, id, data from workspace_records");
    const cvs = await q("select id, candidate_id, application_id, file_name, mime_type, size_bytes, scan_status, source, created_at from cv_documents order by created_at desc");
    const assessment = await assessmentSnapshot(q, org.id, role);
    return { stages, jobs, candidates, applications, notes, activities, records, cvs, assessment };
  });

  const recs = (kind: string) => data.records.filter((r) => r.kind === kind).map((r) => ({ ...r.data, id: r.id }));
  const savedViews = recs("saved_view").filter((v) => !(v as { userId?: string }).userId || (v as { userId?: string }).userId === user.id);
  const emptyFilters = { search: "", stages: [], jobIds: [], sources: [], recruiterIds: [], evaluations: [], status: "active" };

  return {
    version: 100,
    currentUserId: user.id,
    org: {
      id: org.id,
      slug: org.slug,
      name: orgRow.name,
      role,
      roleLabel: ROLE_LABEL[role],
      permissions: permissionsFor(role),
      branding: orgRow.branding,
      logoUrl: logoUrl(org.id, orgRow.branding, "light"),
      logoDarkUrl: logoUrl(org.id, orgRow.branding, "dark"),
      onboarding: orgRow.onboarding,
      features: Object.fromEntries(features.map((f) => [f.key, f.enabled])),
    },
    company: {
      name: orgRow.name,
      legalName: "",
      website: "",
      industry: "",
      size: "",
      headquarters: "",
      about: "",
      careersUrl: "",
      contactEmail: "",
      phone: "",
      linkedin: "",
      twitter: "",
      instagram: "",
      ...orgRow.profile,
    },
    stages: data.stages.map((s) => ({ id: s.stage_key, label: s.label, description: s.description, slaDays: s.sla_days })),
    team: team.map((m) => ({ id: m.id, name: m.name, email: m.email, title: m.title || ROLE_LABEL[m.role], role: ROLE_LABEL[m.role], department: "", hue: hueFor(m.id), status: "active" })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: ROLE_LABEL[i.role], createdAt: iso(i.created_at), expiresAt: iso(i.expires_at) })),
    jobs: data.jobs.map((j) => ({
      id: j.id, slug: j.slug, title: j.title, department: j.department, location: j.location, workplace: j.workplace, employmentType: j.employment_type, contractType: j.contract_type, seniority: j.seniority, status: j.status,
      hiringManagerId: j.hiring_manager_id ?? "", recruiterId: j.recruiter_id ?? "", openings: j.openings, salaryMin: j.salary_min ?? undefined, salaryMax: j.salary_max ?? undefined, currency: j.currency,
      summary: j.summary, responsibilities: j.responsibilities, requirements: j.requirements, requiredExperience: j.required_experience, benefits: j.benefits, skills: j.skills, preferredSkills: j.preferred_skills,
      screeningQuestions: j.screening_questions, channels: j.channels, createdAt: iso(j.created_at), publishedAt: iso(j.published_at), targetHireDate: iso(j.target_hire_date),
    })),
    candidates: data.candidates.map((c) => ({
      id: c.id, fullName: c.full_name, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone, location: c.location, headline: c.headline, currentCompany: c.current_company,
      linkedinUrl: c.linkedin_url ?? undefined, portfolioUrl: c.portfolio_url ?? undefined, githubUrl: c.github_url ?? undefined, source: c.source, tags: c.tags, skills: c.skills, languages: c.languages,
      experience: c.experience, education: c.education, summary: c.summary, extra: c.extra, fieldSources: c.field_sources, hue: c.hue, createdAt: iso(c.created_at), inTalentPool: c.in_talent_pool,
    })),
    applications: data.applications.map((a) => ({
      id: a.id, candidateId: a.candidate_id, jobId: a.job_id, stage: a.stage, status: a.status, appliedAt: iso(a.applied_at), stageEnteredAt: iso(a.stage_entered_at), recruiterId: a.recruiter_id ?? "",
      evaluation: a.evaluation, order: a.sort_order, rejectionReason: a.rejection_reason ?? undefined, withdrawalReason: a.withdrawal_reason ?? undefined, source: a.source, utm: a.utm, answers: a.answers,
    })),
    cvDocuments: data.cvs.map((d) => ({ id: d.id, candidateId: d.candidate_id, applicationId: d.application_id ?? undefined, fileName: d.file_name, mimeType: d.mime_type, sizeBytes: d.size_bytes, scanStatus: d.scan_status, source: d.source, createdAt: iso(d.created_at) })),
    ...data.assessment,
    ...(await aiAndCvSettings(org.id)),
    notes: data.notes.map((n) => ({ id: n.id, candidateId: n.candidate_id, authorId: n.author_id ?? "", body: n.body, pinned: n.pinned, createdAt: iso(n.created_at) })),
    activities: data.activities.map((a) => ({ id: a.id, kind: a.kind, actorId: a.actor_id ?? undefined, candidateId: a.candidate_id ?? undefined, jobId: a.job_id ?? undefined, message: a.message, createdAt: iso(a.created_at) })),
    interviews: recs("interview"),
    scorecards: recs("scorecard"),
    tasks: recs("task"),
    talentLists: recs("talent_list"),
    savedViews: [
      { id: "v_all", name: "All candidates", system: true, filters: emptyFilters, columns: ["position", "job", "source", "stage", "applied", "recruiter", "evaluation"], sort: { key: "applied", dir: "desc" } },
      { id: "v_new", name: "New applications", system: true, filters: { ...emptyFilters, stages: ["applied"] }, columns: ["position", "job", "source", "applied", "recruiter"], sort: { key: "applied", dir: "desc" } },
      ...savedViews,
    ],
    emailTemplates: recs("email_template"),
    notifications: recs("notification").filter((n) => (n as { userId?: string }).userId === user.id).sort((a, b) => String((b as { createdAt?: string }).createdAt).localeCompare(String((a as { createdAt?: string }).createdAt))).slice(0, 50),
    integrations: Object.fromEntries(["linkedin", "google_calendar", "outlook", "gmail", "smtp"].map((p) => [p, integrations.find((i) => i.provider === p)?.status ?? "not_configured"])),
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...orgRow.notification_prefs },
  };
}

export function assertMember(teamIds: string[], id: string | undefined | null, label: string) {
  if (id && !teamIds.includes(id)) throw new HttpError(400, `${label} must be a member of this company`, "validation");
}
