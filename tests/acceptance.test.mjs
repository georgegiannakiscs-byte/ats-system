/**
 * Ulysse - Phase 1 acceptance tests (API + database level).
 * Run against a running server:  BASE_URL=http://localhost:3000 DATABASE_URL=… npm run test:acceptance
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { enableTwoFactor } from "./totp.mjs";
import { clean as cleanCvs, dangerous as dangerousCvs } from "./cv-fixtures.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "postgres://deceler:deceler_dev@localhost:5432/deceler";
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const run = crypto.randomBytes(3).toString("hex");

/* Minimal cookie-jar client */
function client() {
  let cookie = "";
  const call = async (method, url, body, isForm) => {
    const res = await fetch(BASE + url, {
      method,
      redirect: "manual",
      headers: { ...(cookie ? { cookie } : {}), ...(body && !isForm ? { "content-type": "application/json" } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("deceler_session=")) cookie = c.split(";")[0];
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };
  return {
    get: (u) => call("GET", u),
    post: (u, b) => call("POST", u, b),
    put: (u, b) => call("PUT", u, b),
    patch: (u, b) => call("PATCH", u, b),
    del: (u, b) => call("DELETE", u, b),
    form: (u, fd) => call("POST", u, fd, true),
    cmd: (org, type, payload) => call("POST", `/api/orgs/${org}/commands`, { type, payload }),
  };
}

const file = (name, type, buf) => new File([buf ?? fs.readFileSync(path.join(FIX, name))], name, { type });
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const id = (p) => `${p}_${crypto.randomBytes(8).toString("hex")}`;

async function signup(c, name, email) {
  const r = await c.post("/api/auth/signup", { name, email, password: "correct-horse-battery-1" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

async function apply(orgSlug, jobSlug, fields, cvName = "cv.pdf", cvType = "application/pdf", cvBuf) {
  const fd = new FormData();
  fd.append("orgSlug", orgSlug);
  fd.append("jobSlug", jobSlug);
  fd.append("submissionKey", crypto.randomUUID());
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (cvName) fd.append("cv", file(cvName, cvType, cvBuf));
  const res = await fetch(`${BASE}/api/public/apply`, { method: "POST", body: fd });
  return { status: res.status, data: await res.json() };
}

/* Shared state across the scenario */
const owner = client();
const other = client();
const S = {};

test("A - multi-company management", async (t) => {
  await signup(owner, "Owner", `owner-${run}@test.example`);
  for (const [k, name, logo] of [["A", `Alpha ${run}`, "logo-a.png"], ["B", `Beta ${run}`, "logo-b.png"]]) {
    const r = await owner.post("/api/orgs", { name });
    assert.equal(r.status, 201);
    S[k] = r.data;
    const fd = new FormData();
    fd.append("file", file(logo, "image/png"));
    const up = await owner.form(`/api/orgs/${r.data.id}/logo`, fd);
    assert.equal(up.status, 201, JSON.stringify(up.data));
    S[k].logo = up.data.url;
  }
  const me = await owner.get("/api/me");
  const companies = me.data.companies;
  assert.equal(companies.length, 2);
  assert.notEqual(companies.find((c) => c.id === S.A.id).logoUrl, companies.find((c) => c.id === S.B.id).logoUrl, "each company has its own logo");

  // Separate jobs per company
  S.jobA = id("j");
  S.jobB = id("j");
  assert.equal((await owner.cmd(S.A.id, "jobs.create", { id: S.jobA, input: { title: "Data Analyst", department: "Data", location: "Athens", status: "published", skills: ["SQL", "GA4"] } })).status, 200);
  assert.equal((await owner.cmd(S.B.id, "jobs.create", { id: S.jobB, input: { title: "Barista Trainer", location: "Thessaloniki", status: "published" } })).status, 200);
  const snapA = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const snapB = (await owner.get(`/api/orgs/${S.B.id}/snapshot`)).data;
  assert.deepEqual(snapA.jobs.map((j) => j.id), [S.jobA]);
  assert.deepEqual(snapB.jobs.map((j) => j.id), [S.jobB]);
  S.slugA = snapA.org.slug; S.jobSlugA = snapA.jobs[0].slug;
  // Regression: a partial update (e.g. publish/pause) must not reset other fields.
  await owner.cmd(S.A.id, "jobs.update", { id: S.jobA, patch: { status: "on_hold" } });
  await owner.cmd(S.A.id, "jobs.update", { id: S.jobA, patch: { status: "published" } });
  const kept = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.jobs[0];
  assert.equal(kept.location, "Athens");
  assert.deepEqual(kept.skills, ["SQL", "GA4"]);
  S.slugB = snapB.org.slug; S.jobSlugB = snapB.jobs[0].slug;
  assert.equal(snapA.stages.length, 8, "default pipeline created");
  await t.test("independent dashboards via All-my-companies overview", async () => {
    const ov = await owner.get("/api/overview");
    const a = ov.data.companies.find((c) => c.id === S.A.id);
    assert.equal(a.stats.active_jobs, 1);
  });
});

test("D - minimal application with only name, email and CV", async () => {
  const r = await apply(S.slugA, S.jobSlugA, { fullName: "Eleni Georgiou", email: `eleni-${run}@example.com` });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.reference);
  assert.ok(["not_configured", "sent", "failed"].includes(r.data.emailDelivery), "confirmation recorded in outbox");
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const c = snap.candidates.find((x) => x.email === `eleni-${run}@example.com`);
  assert.ok(c, "candidate appears in Company A");
  assert.equal(c.firstName, "Eleni");
  assert.equal(c.lastName, "Georgiou");
  const doc = snap.cvDocuments.find((d) => d.candidateId === c.id);
  assert.ok(doc, "CV stored");
  S.candA = c.id; S.docA = doc.id;
  S.appA = snap.applications.find((a) => a.candidateId === c.id).id;
  // Recruiter can view the CV via a signed URL and gets the original bytes
  const u = await owner.get(`/api/orgs/${S.A.id}/cv/${doc.id}`);
  assert.equal(u.status, 200);
  S.cvUrl = u.data.url;
  const bytes = await owner.get(u.data.url);
  assert.equal(bytes.status, 200);
  assert.ok(bytes.data.equals(fs.readFileSync(path.join(FIX, "cv.pdf"))), "original CV is returned unchanged");
  assert.equal(bytes.headers.get("cache-control"), "private, no-store");

  // DOCX works too
  const d2 = await apply(S.slugA, S.jobSlugA, { fullName: "Nikos Pappas", email: `nikos-${run}@example.com` }, "cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(d2.status, 201, JSON.stringify(d2.data));
});

test("D - validation and abuse protection", async () => {
  assert.equal((await apply(S.slugA, S.jobSlugA, { fullName: "No CV", email: `nocv-${run}@example.com` }, null)).status, 400);
  assert.equal((await apply(S.slugA, S.jobSlugA, { fullName: "Fake", email: `fake-${run}@example.com` }, "fake.pdf", "application/pdf")).status, 415, "content is sniffed, not trusted");
  assert.equal((await apply(S.slugA, S.jobSlugA, { email: `x-${run}@example.com` })).status, 400);
  assert.equal((await apply(S.slugA, S.jobSlugA, { fullName: "Bad Email", email: "not-an-email" })).status, 400);
  assert.equal((await apply(S.slugA, S.jobSlugA, { fullName: "Bot", email: `bot-${run}@example.com`, website: "spam" })).status, 400, "honeypot");
  // idempotent re-submit
  const fd = () => { const f = new FormData(); f.append("orgSlug", S.slugA); f.append("jobSlug", S.jobSlugA); f.append("submissionKey", `dup-key-${run}-0000000`); f.append("fullName", "Double Click"); f.append("email", `dbl-${run}@example.com`); f.append("cv", file("cv.pdf", "application/pdf")); return f; };
  const r1 = await (await fetch(`${BASE}/api/public/apply`, { method: "POST", body: fd() })).json();
  const r2 = await (await fetch(`${BASE}/api/public/apply`, { method: "POST", body: fd() })).json();
  assert.equal(r1.reference, r2.reference);
  assert.equal(r2.duplicate, true);
  // unpublished job rejects applications
  const draft = id("j");
  await owner.cmd(S.A.id, "jobs.create", { id: draft, input: { title: "Secret Draft Role", status: "draft" } });
  const slug = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.jobs.find((j) => j.id === draft).slug;
  assert.equal((await apply(S.slugA, slug, { fullName: "Early Bird", email: `early-${run}@example.com` })).status, 404);
});

test("D2 - CVs with scripts, macros or embedded files are refused", async () => {
  const mime = (n) => (n.endsWith(".pdf") ? "application/pdf" : DOCX);
  for (const [name, make] of Object.entries(dangerousCvs)) {
    const r = await apply(S.slugA, S.jobSlugA, { fullName: "Risky File", email: `risky-${run}@example.com` }, name, mime(name), make());
    assert.equal(r.status, 422, name);
    assert.equal(r.data.code, "cv_active_content", name);
    assert.match(r.data.error, /plain PDF/, "the candidate is told what to do");
  }
  for (const [name, make] of Object.entries(cleanCvs)) {
    const r = await apply(S.slugA, S.jobSlugA, { fullName: "Plain File", email: `plain-${name.length}-${run}@example.com` }, name, mime(name), make());
    assert.equal(r.status, 201, `${name}: ${JSON.stringify(r.data)}`);
  }
  // Recruiters uploading a CV to a profile get the same check.
  const fd = new FormData();
  fd.append("file", file("macros.docx", DOCX, dangerousCvs["docx-macros.docx"]()));
  const up = await owner.form(`/api/orgs/${S.A.id}/candidates/${S.candA}/cv`, fd);
  assert.equal(up.status, 422);
  // Nothing was stored for the refused files.
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  assert.ok(!snap.candidates.some((c) => c.email === `risky-${run}@example.com`));
});

test("E - optional information is saved and editable", async () => {
  const r = await apply(S.slugA, S.jobSlugA, { fullName: "Maria Ioannou", email: `maria-${run}@example.com`, phone: "+30 694 000 0000", linkedinUrl: "https://www.linkedin.com/in/maria", city: "Patras", yearsExperience: "5", salaryExpectations: "40k" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let c = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.candidates.find((x) => x.email === `maria-${run}@example.com`);
  assert.equal(c.phone, "+30 694 000 0000");
  assert.equal(c.location, "Patras");
  assert.equal(c.linkedinUrl, "https://www.linkedin.com/in/maria");
  assert.equal(c.extra.salaryExpectations, "40k");
  assert.equal(c.fieldSources.phone, "candidate");
  // optional URL is validated only when supplied
  assert.equal((await apply(S.slugA, S.jobSlugA, { fullName: "Bad Url", email: `badurl-${run}@example.com`, linkedinUrl: "linkedin" })).status, 400);
  // recruiter completes missing details later
  await owner.cmd(S.A.id, "candidates.update", { id: S.candA, patch: { phone: "+30 210 111 2222", headline: "Data Analyst", extra: { availability: "1 month" } } });
  c = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.candidates.find((x) => x.id === S.candA);
  assert.equal(c.phone, "+30 210 111 2222");
  assert.equal(c.fieldSources.phone, "recruiter");
  assert.equal(c.extra.availability, "1 month");
});

test("I - LinkedIn tracked link records the source", async () => {
  const r = await apply(S.slugA, S.jobSlugA, { fullName: "Kostas Linked", email: `kostas-${run}@example.com`, utmSource: "linkedin", utmCampaign: "launch" });
  assert.equal(r.status, 201);
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const c = snap.candidates.find((x) => x.email === `kostas-${run}@example.com`);
  const a = snap.applications.find((x) => x.candidateId === c.id);
  assert.equal(c.source, "LinkedIn");
  assert.equal(a.utm.campaign, "launch");
  assert.equal(snap.integrations.linkedin, "not_configured", "LinkedIn is never shown as connected without a real connection");
});

test("H - recruitment pipeline to hired", async () => {
  assert.equal((await owner.cmd(S.A.id, "applications.move", { id: S.appA, stage: "hr_interview" })).status, 200);
  const iv = id("i");
  assert.equal((await owner.cmd(S.A.id, "records.upsert", { kind: "interview", id: iv, data: { candidateId: S.candA, jobId: S.jobA, applicationId: S.appA, kind: "HR interview", start: new Date(Date.now() - 3600e3).toISOString(), durationMin: 30, meetingType: "Video", interviewerIds: [], status: "scheduled" } })).status, 200);
  assert.equal((await owner.cmd(S.A.id, "scorecards.submit", { card: { id: id("s"), candidateId: S.candA, jobId: S.jobA, interviewId: iv, recommendation: "yes", criteria: [], summary: "Strong" } })).status, 200);
  await owner.cmd(S.A.id, "applications.move", { id: S.appA, stage: "offer" });
  await owner.cmd(S.A.id, "applications.move", { id: S.appA, stage: "hired" });
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const app = snap.applications.find((a) => a.id === S.appA);
  assert.equal(app.stage, "hired");
  assert.equal(app.status, "hired");
  assert.equal(app.evaluation, "positive");
  assert.equal(snap.interviews.find((i) => i.id === iv).status, "completed");
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  // Even the schema owner only sees tenant rows after explicitly entering the system context.
  assert.equal((await db.query("select count(*)::int n from stage_history where application_id = $1", [S.appA])).rows[0].n, 0, "FORCE RLS applies to the owner too");
  await db.query("select set_config('app.bypass', 'on', false)");
  const h = await db.query("select to_stage from stage_history where application_id = $1 order by id", [S.appA]);
  await db.end();
  assert.deepEqual(h.rows.map((r) => r.to_stage), ["applied", "hr_interview", "offer", "hired"]);
  // rejection and withdrawal are distinct outcomes
  const other1 = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.applications.find((a) => a.status === "active" && a.id !== S.appA);
  await owner.cmd(S.A.id, "applications.withdraw", { id: other1.id, reason: "Accepted another offer" });
  const w = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.applications.find((a) => a.id === other1.id);
  assert.equal(w.status, "withdrawn");
});

test("J - company data isolation (API)", async () => {
  await signup(other, "Other Company Owner", `other-${run}@test.example`);
  const r = await other.post("/api/orgs", { name: `Gamma ${run}` });
  S.C = r.data;
  // direct URL / API access to Company A is denied
  assert.equal((await other.get(`/api/orgs/${S.A.id}/snapshot`)).status, 404);
  assert.equal((await other.cmd(S.A.id, "candidates.update", { id: S.candA, patch: { phone: "hacked" } })).status, 404);
  assert.equal((await other.get(`/api/orgs/${S.A.id}/cv/${S.docA}`)).status, 404);
  // a leaked signed CV link is useless to another user
  assert.ok([403, 404].includes((await other.get(S.cvUrl)).status), "denied (404 hides whether the company exists)");
  // and expired / tampered tokens fail
  assert.equal((await owner.get(S.cvUrl.slice(0, -2) + "xx")).status, 403);
  // cross-tenant ID injection: using Company C's context to touch Company A's candidate does nothing
  await other.cmd(S.C.id, "candidates.update", { id: S.candA, patch: { phone: "hacked" } });
  const c = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.candidates.find((x) => x.id === S.candA);
  assert.notEqual(c.phone, "hacked");
  // and Company C's snapshot contains nothing from A
  const snapC = (await other.get(`/api/orgs/${S.C.id}/snapshot`)).data;
  assert.equal(snapC.candidates.length, 0);
  assert.equal(snapC.jobs.length, 0);
});

test("J - company data isolation (database Row Level Security)", async () => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const [{ id: ownerId }] = (await db.query("select id from users where email = $1", [`owner-${run}@test.example`])).rows;
  const [{ id: otherId }] = (await db.query("select id from users where email = $1", [`other-${run}@test.example`])).rows;
  const asTenant = async (org, user, sql, params = []) => {
    await db.query("begin");
    try {
      await db.query("set local role deceler_app");
      await db.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [org, user]);
      return (await db.query(sql, params)).rows;
    } finally {
      await db.query("rollback");
    }
  };
  // Owner in A sees only A's candidates
  const inA = await asTenant(S.A.id, ownerId, "select distinct org_id from candidates");
  assert.deepEqual(inA.map((r) => r.org_id), [S.A.id]);
  // Other user pinned to Company A (not a member) sees nothing
  assert.equal((await asTenant(S.A.id, otherId, "select count(*)::int n from candidates"))[0].n, 0);
  // Other user in their own company cannot read A's rows by ID
  assert.equal((await asTenant(S.C.id, otherId, "select count(*)::int n from candidates where id = $1", [S.candA]))[0].n, 0);
  assert.equal((await asTenant(S.C.id, otherId, "select count(*)::int n from cv_documents where org_id = $1", [S.A.id]))[0].n, 0);
  // Writes into another company are rejected by the database
  await assert.rejects(asTenant(S.C.id, otherId, "insert into notes (id, org_id, candidate_id, body) values ('n_x', $1, $2, 'x')", [S.A.id, S.candA]), /row-level security/);
  // The tenant role cannot use the system bypass
  assert.equal((await asTenant(S.C.id, otherId, "select set_config('app.bypass','on',true), (select count(*)::int from candidates where org_id = $1) n", [S.A.id]))[0].n, 0);
  await db.end();
});

test("Permissions are per company and enforced server-side", async () => {
  const inv = await owner.post(`/api/orgs/${S.A.id}/invitations`, { email: `other-${run}@test.example`, role: "Interviewer" });
  assert.equal(inv.status, 201);
  const token = inv.data.link.split("/invite/")[1];
  const acc = await other.post(`/api/invitations/${token}`);
  assert.equal(acc.status, 200);
  // Interviewers only see jobs whose hiring team they're on (the default): nothing yet.
  assert.equal((await other.get(`/api/orgs/${S.A.id}/snapshot`)).data.jobs.length, 0, "not on any hiring team yet");
  S.otherId = (await other.get("/api/me")).data.user.id;
  assert.equal((await owner.cmd(S.A.id, "jobs.update", { id: S.jobA, patch: { hiringTeam: [S.otherId] } })).status, 200);
  assert.deepEqual((await other.get(`/api/orgs/${S.A.id}/snapshot`)).data.jobs.map((j) => j.id), [S.jobA]);
  // Same user: Admin in Company C, Interviewer in Company A
  const me = (await other.get("/api/me")).data.companies;
  assert.equal(me.find((c) => c.id === S.C.id).role, "admin");
  assert.equal(me.find((c) => c.id === S.A.id).role, "interviewer");
  assert.equal((await other.cmd(S.A.id, "jobs.create", { id: id("j"), input: { title: "Not allowed" } })).status, 403);
  assert.equal((await other.get(`/api/orgs/${S.A.id}/cv/${S.docA}`)).status, 403, "interviewers cannot download CVs");
  assert.equal((await other.cmd(S.A.id, "applications.move", { id: S.appA, stage: "applied" })).status, 403);
  assert.equal((await other.cmd(S.A.id, "notes.add", { id: id("n"), candidateId: S.candA, body: "Interviewer note" })).status, 200, "interviewers can write notes");
  // invitation tokens are single-use
  assert.equal((await other.post(`/api/invitations/${token}`)).status, 404);
});

test("C - branding & logo replacement", async () => {
  const html = await (await fetch(`${BASE}/careers/${S.slugA}`)).text();
  assert.ok(html.includes(`/api/public/logo/${S.A.id}/light`), "logo on careers page");
  const before = (await owner.get("/api/me")).data.companies.find((c) => c.id === S.A.id).logoUrl;
  const fd = new FormData();
  fd.append("file", file("logo-b.png", "image/png"));
  const up = await owner.form(`/api/orgs/${S.A.id}/logo`, fd);
  assert.equal(up.status, 201);
  const after = (await owner.get("/api/me")).data.companies.find((c) => c.id === S.A.id).logoUrl;
  assert.notEqual(before, after, "logo version changes so every surface refreshes");
  const img = await fetch(BASE + after);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");
  const bad = new FormData();
  bad.append("file", file("evil.svg", "image/svg+xml"));
  assert.equal((await owner.form(`/api/orgs/${S.A.id}/logo`, bad)).status, 415, "unsafe SVG rejected");
  const job = await (await fetch(`${BASE}/careers/${S.slugA}/${S.jobSlugA}`)).text();
  assert.ok(job.includes('"@type":"JobPosting"'), "JobPosting structured data");
  assert.ok(job.includes(`rel="canonical"`), "canonical URL");
  assert.ok(!/Posted\s/.test(job.replace(/<script[\s\S]*?<\/script>/g, "")), "no posting date on the job page");
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  assert.ok(sitemap.includes(`/careers/${S.slugA}/${S.jobSlugA}`));
  assert.ok(!sitemap.includes("secret-draft-role"), "drafts are not in the sitemap");
});

test("C2 - careers page theme (colours, fonts, style)", async () => {
  const brand = (payload) => owner.cmd(S.A.id, "settings.branding", payload);
  assert.equal((await brand({ headingFont: "Comic Sans" })).status, 400, "unknown font rejected");
  assert.equal((await brand({ cornerStyle: "blob" })).status, 400, "unknown corner style rejected");
  assert.equal((await brand({ backgroundColor: "#fff;}body{display:none" })).status, 400, "CSS injection rejected");
  assert.equal((await brand({ backgroundColor: "#0E1A2B", textColor: "", primaryColor: "#0B3D91", accentColor: "#F2A900", headingFont: "eb-garamond", bodyFont: "manrope", cornerStyle: "round", heroStyle: "band" })).status, 200);
  const css = (html) => html.match(/:root:root\{[^<]*\}/)?.[0] ?? "";
  const themed = css(await (await fetch(`${BASE}/careers/${S.slugA}`)).text());
  assert.ok(themed.includes("--background:#0E1A2B") && themed.includes("--foreground:#ffffff"), "custom background with automatic text colour");
  assert.ok(themed.includes("--primary:#0B3D91") && themed.includes("--careers-accent:#F2A900") && themed.includes("--radius:1rem"));
  assert.ok(/--font-display-serif:'EB Garamond'/.test(themed) && /--font-geist-sans:'Manrope'/.test(themed), "chosen fonts");
  assert.ok(css(await (await fetch(`${BASE}/careers/${S.slugA}/${S.jobSlugA}`)).text()).includes("--background:#0E1A2B"), "job page uses the theme");
  // The platform admin can switch custom branding off for a company: the careers page falls back to the defaults.
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("insert into org_features (org_id, feature_key, enabled) values ($1, 'custom_branding', false) on conflict (org_id, feature_key) do update set enabled = false", [S.A.id]);
  const off = css(await (await fetch(`${BASE}/careers/${S.slugA}`)).text());
  await db.query("delete from org_features where org_id = $1 and feature_key = 'custom_branding'", [S.A.id]);
  await db.end();
  assert.ok(off.includes("--primary:#193329") && !off.includes("--background:") && !off.includes("EB Garamond"), "defaults when custom branding is off");
  assert.equal((await brand({ backgroundColor: "", headingFont: "default", bodyFont: "default", cornerStyle: "rounded", heroStyle: "plain" })).status, 200, "back to defaults");
  assert.ok(!css(await (await fetch(`${BASE}/careers/${S.slugA}`)).text()).includes("--background:"), "empty background = follow light/dark");
});

test("C4 - company custom CSS on careers pages (CSS only, nothing that loads resources)", async () => {
  const brand = (payload) => owner.cmd(S.A.id, "settings.branding", payload);
  for (const bad of [
    ".careers-hero { background: url(https://evil.example/x.png) }",
    "</style><script>alert(1)</script>",
    "@import 'https://evil.example/a.css';",
    ".x { background: u\\72l(https://evil.example) }",
    "input[value^=a] { background-image: image-set('https://evil.example/a' 1x) }",
    "@font-face { font-family: X; src: local(Arial) }",
  ]) assert.equal((await brand({ customCss: bad })).status, 400, bad);
  const css = ".careers-headline { letter-spacing: -0.04em; }\n.careers-button { border-radius: 999px; }";
  assert.equal((await brand({ customCss: css })).status, 200);
  const page = await (await fetch(`${BASE}/careers/${S.slugA}`)).text();
  assert.ok(page.includes("<style data-custom-css") && page.includes(".careers-headline { letter-spacing: -0.04em; }"), "custom CSS on the careers page");
  assert.ok(page.includes('class="careers-headline'), "stable class names");
  assert.ok((await (await fetch(`${BASE}/careers/${S.slugA}/${S.jobSlugA}`)).text()).includes("data-custom-css"), "and on the job page");
  // Stored values are checked again before rendering, and the platform switch turns it off.
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("update organizations set branding = branding || jsonb_build_object('customCss', $2::text) where id = $1", [S.A.id, ".x{background:url(https://evil.example)}"]);
  assert.ok(!(await (await fetch(`${BASE}/careers/${S.slugA}`)).text()).includes("evil.example"), "unsafe stored CSS isn't rendered");
  await db.query("update organizations set branding = branding || jsonb_build_object('customCss', $2::text) where id = $1", [S.A.id, css]);
  await db.query("insert into org_features (org_id, feature_key, enabled) values ($1, 'custom_branding', false) on conflict (org_id, feature_key) do update set enabled = false", [S.A.id]);
  const off = await (await fetch(`${BASE}/careers/${S.slugA}`)).text();
  await db.query("delete from org_features where org_id = $1 and feature_key = 'custom_branding'", [S.A.id]);
  await db.end();
  assert.ok(!off.includes("data-custom-css"), "off when custom branding is off");
  assert.equal((await brand({ customCss: "" })).status, 200);
});

test("C3 - optional Nice to have list on the job page", async () => {
  const page = async () => (await fetch(`${BASE}/careers/${S.slugA}/${S.jobSlugA}?lang=en`)).text();
  assert.ok(!(await page()).includes(">Nice to have</h2>"), "hidden while empty");
  assert.equal((await owner.cmd(S.A.id, "jobs.update", { id: S.jobA, patch: { niceToHave: "Server-side tagging\n\nGreek language skills" } })).status, 200);
  const html = await page();
  assert.ok(html.includes(">Nice to have</h2>") && html.includes("<li>Server-side tagging</li>") && html.includes("<li>Greek language skills</li>"));
  assert.equal((await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.jobs.find((j) => j.id === S.jobA).niceToHave, "Server-side tagging\n\nGreek language skills");
  const el = await (await fetch(`${BASE}/careers/${S.slugA}/${S.jobSlugA}?lang=el`)).text();
  assert.ok(el.includes(">Nice to have</h2>") && !el.includes("Επιθυμητά"), "English only, even with ?lang=el");
  assert.ok(!el.includes('aria-label="Language"'), "no language switch on careers pages");
  await owner.cmd(S.A.id, "jobs.update", { id: S.jobA, patch: { niceToHave: "" } });
  assert.ok(!(await page()).includes(">Nice to have</h2>"), "hidden again once cleared");
});

test("C5 - careers cover image (photos only, metadata removed, behind the headline or as a banner)", async () => {
  const { default: sharp } = await import("sharp");
  const photo = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 90, b: 140 } } })
    .jpeg().withMetadata({ exif: { IFD0: { Artist: "Secret Photographer", Copyright: "GPS 37.97N 23.72E" } } }).toBuffer();
  const up = async (c, buf, name = "cover.jpg", type = "image/jpeg") => { const fd = new FormData(); fd.append("file", new File([buf], name, { type })); return c.form(`/api/orgs/${S.A.id}/cover`, fd); };
  assert.equal((await up(other, await photo(1600, 600))).status, 403, "only branding admins");
  assert.equal((await up(owner, await photo(600, 300))).data.code, "too_small");
  assert.equal((await up(owner, fs.readFileSync(path.join(FIX, "evil.svg")), "x.svg", "image/svg+xml")).status, 415, "no SVG");
  const ok = await up(owner, await photo(3000, 1000));
  assert.equal(ok.status, 201);
  const img = await fetch(BASE + ok.data.url);
  assert.equal(img.headers.get("content-type"), "image/webp");
  const served = Buffer.from(await img.arrayBuffer());
  const meta = await sharp(served).metadata();
  assert.equal(meta.width, 2400, "resized for the web");
  assert.ok(!meta.exif && !served.includes(Buffer.from("Secret Photographer")), "metadata removed");
  const page = () => fetch(`${BASE}/careers/${S.slugA}`).then((r) => r.text());
  let html = await page();
  assert.match(html, /careers-hero-cover/, "behind the headline by default");
  assert.match(html, new RegExp(`og:image" content="[^"]*/api/public/cover/${S.A.id}`), "used for link previews");
  assert.equal((await owner.cmd(S.A.id, "settings.branding", { coverStyle: "banner", coverPosition: "top" })).status, 200);
  html = await page();
  assert.match(html, /careers-cover-banner/);
  assert.match(html, /object-position:center top/);
  assert.equal((await owner.cmd(S.A.id, "settings.branding", { coverStyle: "sideways" })).status, 400);
  assert.equal((await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.org.coverUrl, ok.data.url);
  assert.equal((await owner.del(`/api/orgs/${S.A.id}/cover`)).status, 200);
  assert.equal((await fetch(BASE + ok.data.url)).status, 404);
  assert.doesNotMatch(await page(), /careers-cover/);
});

test("B - platform super admin", async () => {
  // The first registered account on a fresh platform is bootstrapped as platform admin in development.
  // Promote the test owner explicitly so this test is independent of ordering.
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("update users set is_platform_admin = true where email = $1", [`owner-${run}@test.example`]);
  await db.end();
  assert.equal((await owner.get("/api/admin/overview")).data.code, "two_factor_required", "platform administration needs two-step verification");
  S.owner2fa = await enableTwoFactor(owner, "correct-horse-battery-1");
  const ov = await owner.get("/api/admin/overview");
  assert.equal(ov.status, 200);
  assert.ok(ov.data.metrics.companies >= 3);
  assert.equal((await other.get("/api/admin/overview")).status, 403, "non-admins are refused");
  const list = await owner.get(`/api/admin/companies?q=${run}`);
  assert.ok(list.data.companies.length >= 3);
  const created = await owner.post("/api/admin/companies", { name: `Delta ${run}`, adminEmail: `delta-admin-${run}@test.example` });
  assert.equal(created.status, 201);
  assert.ok(created.data.invite.link.includes("/invite/"));
  // super admin is NOT a member of the new company → no access to its data
  assert.equal((await owner.get(`/api/orgs/${created.data.id}/snapshot`)).status, 404);
  // suspend & reactivate with audit
  assert.equal((await owner.patch(`/api/admin/companies/${S.B.id}`, { status: "suspended" })).status, 400, "reason required");
  assert.equal((await owner.patch(`/api/admin/companies/${S.B.id}`, { status: "suspended", reason: "Test" })).status, 200);
  assert.equal((await owner.get(`/api/orgs/${S.B.id}/snapshot`)).status, 423, "suspended workspace is locked");
  assert.equal((await fetch(`${BASE}/careers/${S.slugB}`)).status, 404, "careers page offline while suspended");
  assert.equal((await owner.patch(`/api/admin/companies/${S.B.id}`, { status: "active" })).status, 200);
  assert.equal((await owner.get(`/api/orgs/${S.B.id}/snapshot`)).status, 200);
  // users & memberships
  const users = await owner.get(`/api/admin/users?q=${run}`);
  const o = users.data.users.find((u) => u.email === `other-${run}@test.example`);
  assert.ok(o.memberships.length >= 2);
  assert.ok(!("password_hash" in o) && !("passwordHash" in o), "credentials are never exposed");
  // features & settings
  assert.equal((await owner.put("/api/admin/features", { key: "ai_copilot", orgId: S.A.id, enabled: true })).status, 200);
  assert.equal((await owner.put("/api/admin/settings", { key: "storage", value: { maxCvMb: 10, maxLogoMb: 2, perCompanyQuotaMb: 5000 } })).status, 200);
  assert.equal((await owner.put("/api/admin/settings", { key: "storage", value: { maxCvMb: 9999 } })).status, 400);
  // integration health never includes secrets
  const ih = await owner.get("/api/admin/integrations");
  assert.ok(!JSON.stringify(ih.data).match(/secret|password|token/i) || ih.data.platform.every((p) => typeof p.configured === "boolean"));
  // audit log
  const audit = await owner.get(`/api/admin/audit?q=company.suspended`);
  assert.ok(audit.data.entries.some((e) => e.action === "company.suspended"));
  // no candidate data in admin APIs
  const all = JSON.stringify([ov.data, list.data, users.data, ih.data, audit.data]);
  assert.ok(!all.includes(`eleni-${run}@example.com`), "no candidate personal data in platform admin responses");
});

test("B2 - archive and permanent deletion of a company (data and files)", async () => {
  // A company with a published job, an application with a CV and a logo
  const org = await owner.post("/api/orgs", { name: `Zeta ${run}` });
  assert.equal(org.status, 201);
  const zid = org.data.id;
  const job = id("j");
  assert.equal((await owner.cmd(zid, "jobs.create", { id: job, input: { title: "Doomed role", status: "published" } })).status, 200);
  const snap = (await owner.get(`/api/orgs/${zid}/snapshot`)).data;
  const app = await apply(snap.org.slug, snap.jobs[0].slug, { fullName: "Zoe Zeta", email: `zoe-${run}@example.com` });
  assert.equal(app.status, 201, JSON.stringify(app.data));
  const fd = new FormData();
  fd.append("file", file("logo-a.png", "image/png"));
  assert.equal((await owner.form(`/api/orgs/${zid}/logo`, fd)).status, 201);
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  // Row Level Security hides company data even from the owner role, so read in the system context.
  const asSystem = async (sql, params) => { await db.query("begin"); await db.query("select set_config('app.bypass', 'on', true)"); try { return await db.query(sql, params); } finally { await db.query("commit"); } };
  const keys = (await asSystem("select storage_key from cv_documents where org_id = $1", [zid])).rows.map((r) => r.storage_key);
  assert.equal(keys.length, 1);
  // Archive = no access, data kept, reversible
  assert.equal((await owner.patch(`/api/admin/companies/${zid}`, { status: "suspended", reason: "Archive test" })).status, 200);
  assert.equal((await owner.get(`/api/orgs/${zid}/snapshot`)).status, 423);
  assert.equal((await owner.patch(`/api/admin/companies/${zid}`, { status: "active" })).status, 200);
  assert.equal((await owner.get(`/api/orgs/${zid}/snapshot`)).status, 200, "restored");
  // Permanent deletion: platform admin only, exact name, reason and password
  const body = { confirmName: `Zeta ${run}`, reason: "Contract ended", password: "correct-horse-battery-1" };
  assert.equal((await other.del(`/api/admin/companies/${zid}`, body)).status, 403);
  assert.equal((await owner.del(`/api/admin/companies/${zid}`, { ...body, confirmName: "Zeta" })).status, 400, "name must match");
  assert.equal((await owner.del(`/api/admin/companies/${zid}`, { ...body, password: "wrong-password-123" })).status, 400, "password required");
  assert.equal((await owner.del(`/api/admin/companies/${zid}`, { ...body, reason: "" })).status, 400, "reason required");
  const del = await owner.del(`/api/admin/companies/${zid}`, body);
  assert.equal(del.status, 200);
  assert.deepEqual(del.data.deleted, { jobs: 1, candidates: 1, applications: 1, members: 1 });
  assert.equal((await owner.get(`/api/orgs/${zid}/snapshot`)).status, 404);
  assert.equal((await fetch(`${BASE}/careers/${snap.org.slug}`)).status, 404);
  for (const t of ["jobs", "candidates", "applications", "cv_documents", "memberships", "invitations"])
    assert.equal((await asSystem(`select count(*)::int n from ${t} where org_id = $1`, [zid])).rows[0].n, 0, t);
  assert.equal((await asSystem("select count(*)::int n from stored_objects where key like any($1)", [[`cv/${zid}/%`, `logos/${zid}/%`]])).rows[0].n, 0, "files in the database are gone");
  if (process.env.STORAGE_DIR) for (const k of keys) assert.equal(fs.existsSync(path.join(process.env.STORAGE_DIR, k)), false, "CV file on disk is gone");
  const log = (await asSystem("select org_id, metadata from audit_logs where action = 'company.deleted' and target_id = $1", [zid])).rows;
  await db.end();
  assert.equal(log.length, 1, "deletion recorded in the audit log");
  assert.equal(log[0].metadata.reason, "Contract ended");
  assert.equal((await owner.get(`/api/admin/companies/${zid}`)).status, 404);
});

test("I2 - LinkedIn Basic Jobs XML feed (opt-in, secret address, LinkedIn's format)", async () => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const key = (await db.query("select value->>'key' k from platform_settings where key = 'linkedin_feed'")).rows[0].k;
  await db.end();
  assert.ok(key && key.length >= 32);
  const feed = async (k = key) => fetch(`${BASE}/api/public/linkedin-jobs?key=${encodeURIComponent(k)}`);
  assert.equal((await feed("")).status, 404, "no key");
  assert.equal((await feed("x".repeat(key.length))).status, 404, "wrong key");
  // Opt in, with validation
  const set = (v) => owner.cmd(S.A.id, "settings.linkedinFeed", v);
  assert.equal((await set({ enabled: true, companyId: "abc", posterEmail: "jobs@a.example", country: "GR" })).status, 400, "company ID must be a number");
  assert.equal((await set({ enabled: true, companyId: "12345678", posterEmail: "not-an-email", country: "GR" })).status, 400);
  assert.equal((await set({ enabled: true, companyId: "12345678", posterEmail: "jobs@a.example", country: "gr" })).status, 200);
  // A complete job (description over 100 characters, location, skills, salary) and tricky text
  const long = "We are looking for an analyst who turns marketing data into clear decisions for the whole team, every week.";
  assert.equal((await owner.cmd(S.A.id, "jobs.update", { id: S.jobA, patch: { summary: long, location: "Athens, Greece", workplace: "Hybrid", employmentType: "Full-time", seniority: "Senior", salaryMin: 30000, salaryMax: 42000, currency: "EUR", requirements: "SQL <script>alert(1)</script>\nGA4 ]]> tricks" } })).status, 200);
  const shortJob = id("j");
  assert.equal((await owner.cmd(S.A.id, "jobs.create", { id: shortJob, input: { title: "Too short", status: "published", summary: "Short." } })).status, 200);
  const r = await feed();
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /application\/xml/);
  const xml = await r.text();
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && xml.includes("<source>") && xml.trim().endsWith("</source>"));
  const job = xml.split("<job>").find((j) => j.includes(`<partnerJobId><![CDATA[${S.jobA}]]></partnerJobId>`));
  assert.ok(job, "published job of an opted-in company is in the feed");
  for (const part of ["<companyId><![CDATA[12345678]]></companyId>", "<posterEmail><![CDATA[jobs@a.example]]></posterEmail>", "<city><![CDATA[Athens]]></city>", "<country><![CDATA[GR]]></country>",
    "<workplaceTypes><![CDATA[Hybrid]]></workplaceTypes>", "<jobtype><![CDATA[FULL_TIME]]></jobtype>", "<experienceLevel><![CDATA[MID_SENIOR_LEVEL]]></experienceLevel>",
    "<amount><![CDATA[42000]]></amount>", "<currencyCode><![CDATA[EUR]]></currencyCode>", "<period><![CDATA[YEARLY]]></period>"]) assert.ok(job.includes(part), part);
  assert.match(job, /<applyUrl><!\[CDATA\[https?:\/\/[^\]]+\/careers\/[^\]]+\?utm_source=linkedin&utm_medium=jobs[^\]]*\]\]><\/applyUrl>/);
  assert.match(job, /<description><!\[CDATA\[<p>We are looking/);
  assert.ok(!job.includes("<script") && (job.match(/\]\]>/g) ?? []).length === (job.match(/<!\[CDATA\[/g) ?? []).length, "user text can't break out of CDATA or add tags");
  assert.ok(!xml.includes(shortJob), "descriptions under 100 characters are left out");
  assert.ok(!xml.includes(S.slugB ?? "never-in-feed"), "companies that didn't opt in aren't in the feed");
  const report = (await owner.get("/api/admin/linkedin-feed")).data;
  assert.ok(report.report.skipped.some((x) => x.job === "Too short" && /100 characters/.test(x.reason)));
  assert.equal((await other.get("/api/admin/linkedin-feed")).status, 403);
  // Opting out removes the jobs
  assert.equal((await set({ enabled: false, companyId: "12345678", posterEmail: "jobs@a.example", country: "GR" })).status, 200);
  assert.ok(!(await (await feed()).text()).includes(S.jobA), "gone once the company opts out");
  assert.equal((await owner.cmd(S.A.id, "jobs.update", { id: shortJob, patch: { status: "closed" } })).status, 200);
});

test("K - GDPR: privacy settings, data export, erasure on request and automatic retention", async () => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const asSystem = async (sql, params) => { await db.query("begin"); await db.query("select set_config('app.bypass', 'on', true)"); try { return await db.query(sql, params); } finally { await db.query("commit"); } };
  try {
    // Settings, shown to candidates
    const privacy = (v) => owner.cmd(S.A.id, "settings.privacy", v);
    assert.equal((await privacy({ retentionMonths: 6, policyUrl: "http://a.example/privacy", contactEmail: "" })).status, 400, "https only");
    assert.equal((await privacy({ retentionMonths: 0, policyUrl: "", contactEmail: "" })).status, 400);
    assert.equal((await privacy({ retentionMonths: 6, policyUrl: "https://www.alpha.example/privacy", contactEmail: "privacy@alpha.example" })).status, 200);
    const page = await (await fetch(`${BASE}/careers/${S.slugA}/${S.jobSlugA}`)).text();
    assert.ok(page.includes("kept for <!-- -->6<!-- --> months") || page.includes("kept for 6 months"), "retention period on the application form");
    assert.ok(page.includes("https://www.alpha.example/privacy") && page.includes("mailto:privacy@alpha.example"));
    assert.equal((await other.get(`/api/orgs/${S.A.id}/privacy`)).status, 403);
    // A candidate who applied with a CV
    const app = await apply(S.slugA, S.jobSlugA, { fullName: "Gina Gdpr", email: `gina-${run}@example.com` });
    assert.equal(app.status, 201);
    const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
    const cand = snap.candidates.find((c) => c.email === `gina-${run}@example.com`);
    const keys = (await asSystem("select storage_key from cv_documents where candidate_id = $1", [cand.id])).rows.map((r) => r.storage_key);
    assert.equal(keys.length, 1);
    // Export (access request)
    assert.equal((await other.get(`/api/orgs/${S.A.id}/candidates/${cand.id}/export`)).status, 403, "interviewers can't export");
    const exp = await owner.get(`/api/orgs/${S.A.id}/candidates/${cand.id}/export`);
    assert.equal(exp.status, 200);
    const data = typeof exp.data === "string" ? JSON.parse(exp.data) : exp.data;
    assert.equal(data.candidate.email, `gina-${run}@example.com`);
    assert.equal(data.applications.length, 1);
    assert.equal(data.files.length, 1);
    // Erasure on request
    assert.equal((await other.cmd(S.A.id, "candidates.erase", { id: cand.id, reason: "asked" })).status, 403);
    assert.equal((await owner.cmd(S.A.id, "candidates.erase", { id: cand.id, reason: "" })).status, 400, "reason required");
    assert.equal((await owner.cmd(S.A.id, "candidates.erase", { id: cand.id, reason: "Candidate asked us to delete their data" })).status, 200);
    for (const t of ["candidates", "applications", "cv_documents", "notes"]) assert.equal((await asSystem(`select count(*)::int n from ${t} where ${t === "candidates" ? "id" : "candidate_id"} = $1`, [cand.id])).rows[0].n, 0, t);
    assert.equal((await asSystem("select count(*)::int n from activities where candidate_id = $1", [cand.id])).rows[0].n, 0, "activity lines");
    assert.equal((await asSystem("select count(*)::int n from email_outbox where lower(to_email) = $1", [`gina-${run}@example.com`])).rows[0].n, 0, "emails to them");
    assert.equal((await asSystem("select count(*)::int n from stored_objects where key = any($1)", [keys])).rows[0].n, 0, "files in the database");
    if (process.env.STORAGE_DIR) assert.equal(fs.existsSync(path.join(process.env.STORAGE_DIR, keys[0])), false, "file on disk");
    const log = (await asSystem("select metadata from audit_logs where action = 'candidate.erased' and target_id = $1", [cand.id])).rows;
    assert.equal(log.length, 1);
    assert.ok(!JSON.stringify(log[0].metadata).includes("gina-"), "the audit log keeps no personal data");
    // Automatic retention: closed applications with no activity for longer than the period
    const old = await apply(S.slugA, S.jobSlugA, { fullName: "Otto Old", email: `otto-${run}@example.com` });
    const recent = await apply(S.slugA, S.jobSlugA, { fullName: "Rita Recent", email: `rita-${run}@example.com` });
    assert.equal(old.status, 201); assert.equal(recent.status, 201);
    const snap2 = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
    const ottoId = snap2.candidates.find((c) => c.email === `otto-${run}@example.com`).id;
    const ritaId = snap2.candidates.find((c) => c.email === `rita-${run}@example.com`).id;
    for (const cid of [ottoId, ritaId]) {
      const appId = snap2.applications.find((x) => x.candidateId === cid).id;
      assert.equal((await owner.cmd(S.A.id, "applications.reject", { id: appId, reason: "Not a fit" })).status, 200);
    }
    await asSystem("update candidates set created_at = now() - interval '7 months', updated_at = now() - interval '7 months' where id = $1", [ottoId]);
    await asSystem("update applications set applied_at = now() - interval '7 months', stage_entered_at = now() - interval '7 months' where candidate_id = $1", [ottoId]);
    assert.ok((await owner.get(`/api/orgs/${S.A.id}/privacy`)).data.dueNow >= 1, "shown as due before it runs");
    assert.equal((await other.post("/api/admin/retention")).status, 403);
    const run1 = await owner.post("/api/admin/retention");
    assert.equal(run1.status, 200);
    assert.ok(run1.data.erased >= 1);
    assert.equal((await asSystem("select count(*)::int n from candidates where id = $1", [ottoId])).rows[0].n, 0, "expired candidate deleted");
    assert.equal((await asSystem("select count(*)::int n from candidates where id = $1", [ritaId])).rows[0].n, 1, "recent candidate kept");
    // CV Builder drafts and talent leads, which belong to no candidate record
    await asSystem("insert into cv_drafts (org_id, job_id, token_hash, template, data, storage_key, size_bytes, sha256, expires_at) values ($1, $2, $3, 'minimal', '{}', $4, 1, 'x', now() - interval '3 days')", [S.A.id, S.jobA, `t-${run}`, `cv-drafts/${S.A.id}/never-${run}.pdf`]);
    await asSystem(`insert into talent_leads (full_name, email, role, consent_at, cv_key, cv_file_name, cv_mime, cv_size, cv_sha256, submission_key, created_at, updated_at)
      values ('Old Lead', $1, 'Analyst', now() - interval '30 months', $2, 'cv.pdf', 'application/pdf', 1, 'x', $3, now() - interval '30 months', now() - interval '30 months')`, [`oldlead-${run}@example.com`, `talent/old-${run}.pdf`, `sk-${run}`]);
    assert.equal((await owner.post("/api/admin/retention")).status, 200);
    assert.equal((await asSystem("select count(*)::int n from cv_drafts where token_hash = $1", [`t-${run}`])).rows[0].n, 0, "expired unused draft removed");
    assert.equal((await asSystem("select count(*)::int n from cv_drafts where consumed_at is not null")).rows[0].n, 0, "used drafts keep no copy of the CV data");
    assert.equal((await asSystem("select count(*)::int n from talent_leads where email = $1", [`oldlead-${run}@example.com`])).rows[0].n, 0, "expired talent lead removed");
  } finally {
    await owner.cmd(S.A.id, "settings.privacy", { retentionMonths: null, policyUrl: "", contactEmail: "" });
    await db.end();
  }
});

test("L - email: candidate messages, forgot password, sender and reply-to", async () => {
  const MAILS = process.env.MAIL_CATCHER_DIR; // set when the server runs with SMTP to a local catcher
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const cand = snap.candidates[0];
  const anon = client();
  if (!MAILS) {
    assert.equal(snap.emailDelivery, false);
    assert.equal((await owner.cmd(S.A.id, "emails.send", { candidateId: cand.id, subject: "Hello", body: "Hello there" })).status, 409, "not sent without email delivery");
    assert.equal((await anon.post("/api/auth/forgot", { email: `owner-${run}@test.example` })).data.delivery, "not_configured");
    return;
  }
  const read = () => fs.readdirSync(MAILS).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(MAILS, f), "utf8")));
  const before = read().length;
  assert.equal(snap.emailDelivery, true);
  assert.equal((await other.cmd(S.A.id, "emails.send", { candidateId: cand.id, subject: "Hi", body: "Hello there" })).status, 403, "interviewers can't email candidates");
  assert.equal((await owner.cmd(S.A.id, "emails.send", { candidateId: cand.id, subject: "Next steps", body: "Hello, could we talk on Monday?" })).status, 200);
  // Forgot password: same answer whether the account exists or not; only real accounts get an email.
  const known = await anon.post("/api/auth/forgot", { email: `owner-${run}@test.example` });
  const unknown = await anon.post("/api/auth/forgot", { email: `nobody-${run}@test.example` });
  assert.deepEqual(known.data, unknown.data);
  await new Promise((r) => setTimeout(r, 500));
  const mails = read().slice(before);
  const msg = mails.find((m) => m.subject === "Next steps");
  assert.ok(msg, "candidate email delivered");
  assert.equal(msg.to, cand.email);
  assert.match(msg.from, new RegExp(`"?${snap.org.name}"?`), "sent in the company's name");
  assert.equal(msg.headers["reply-to"], `owner-${run}@test.example`, "replies go to the sender");
  const reset = mails.find((m) => m.subject === "Reset your Ulysse password");
  assert.ok(reset && reset.to === `owner-${run}@test.example`);
  assert.ok(!mails.some((m) => m.to === `nobody-${run}@test.example`), "no email for unknown accounts");
  const link = reset.text.match(/\/reset\/([A-Za-z0-9_-]+)/)[1];
  assert.equal((await anon.post("/api/auth/reset", { token: link, password: "a-brand-new-pass-9" })).status, 200);
  assert.equal((await anon.post("/api/auth/reset", { token: link, password: "another-new-pass-9" })).status, 400, "single use");
  const relog = client();
  await login(relog, `owner-${run}@test.example`, "a-brand-new-pass-9");
  // keep the rest of the suite working with the original password
  assert.equal((await relog.post("/api/me/password", { currentPassword: "a-brand-new-pass-9", newPassword: "correct-horse-battery-1" })).status, 200);
  await login(owner, `owner-${run}@test.example`, "correct-horse-battery-1");
});

/** Signs in, completing the second step with a recovery code when the account has it on (the owner does, as platform admin). */
async function login(c, email, password) {
  const r = await c.post("/api/auth/login", { email, password });
  assert.equal(r.status, 200);
  if (r.data.mfaRequired) assert.equal((await c.post("/api/auth/login/verify", { ticket: r.data.ticket, code: S.owner2fa.recoveryCodes.pop() })).status, 200);
}

test("M - a company can require two-step verification for its members", async () => {
  // The owner has it on (turned on in B); the interviewer in Company A doesn't.
  assert.equal((await other.cmd(S.A.id, "settings.security", { requireTwoFactor: true })).status, 403, "only admins change it");
  assert.equal((await other.cmd(S.C.id, "settings.security", { requireTwoFactor: true })).data.code, "two_factor_required", "an admin needs it on themselves first");
  assert.equal((await owner.cmd(S.A.id, "settings.security", { requireTwoFactor: true })).status, 200);
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  assert.equal(snap.org.requireTwoFactor, true);
  assert.equal(snap.team.find((m) => m.email === `other-${run}@test.example`).twoFactor, false, "admins can see who doesn't have it");
  const blocked = await other.get(`/api/orgs/${S.A.id}/snapshot`);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, "two_factor_required");
  assert.match(await other.get(`/app/${S.slugA}/dashboard`).then((r) => r.data.toString()), /requires two-step verification/, "the workspace explains what to do");
  assert.equal((await other.get(`/api/orgs/${S.C.id}/snapshot`)).status, 200, "other companies are unaffected");
  await enableTwoFactor(other, "correct-horse-battery-1");
  assert.equal((await other.get(`/api/orgs/${S.A.id}/snapshot`)).status, 200, "allowed once it's on");
  assert.equal((await owner.cmd(S.A.id, "settings.security", { requireTwoFactor: false })).status, 200);
});

test("N - Hiring Managers and Interviewers see only the jobs they're on", async () => {
  const hm = client();
  await signup(hm, "Hiring Manager", `hm-${run}@test.example`);
  const inv = await owner.post(`/api/orgs/${S.A.id}/invitations`, { email: `hm-${run}@test.example`, role: "Hiring Manager" });
  assert.equal((await hm.post(`/api/invitations/${inv.data.link.split("/invite/")[1]}`)).status, 200);
  const hmId = (await hm.get("/api/me")).data.user.id;
  const jobX = id("j"), jobY = id("j");
  assert.equal((await owner.cmd(S.A.id, "jobs.create", { id: jobX, input: { title: "Team Lead", status: "published", hiringManagerId: hmId } })).status, 200);
  assert.equal((await owner.cmd(S.A.id, "jobs.create", { id: jobY, input: { title: "Confidential Director", status: "published" } })).status, 200);
  const slugs = Object.fromEntries((await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.jobs.map((j) => [j.id, j.slug]));
  assert.equal((await apply(S.slugA, slugs[jobX], { fullName: "Visible Vera", email: `vera-${run}@example.com` })).status, 201);
  assert.equal((await apply(S.slugA, slugs[jobY], { fullName: "Hidden Hector", email: `hector-${run}@example.com` })).status, 201);
  assert.equal((await apply(S.slugA, slugs[jobY], { fullName: "Both Bo", email: `bo-${run}@example.com` })).status, 201);
  assert.equal((await apply(S.slugA, slugs[jobX], { fullName: "Both Bo", email: `bo-${run}@example.com` })).status, 201);
  const all = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const cand = (e) => all.candidates.find((c) => c.email === `${e}-${run}@example.com`);
  const hector = cand("hector"), vera = cand("vera"), bo = cand("bo");
  const appOf = (c, j) => all.applications.find((x) => x.candidateId === c.id && x.jobId === j);
  const docOf = (c) => all.cvDocuments.find((d) => d.candidateId === c.id);

  // What the hiring manager sees
  const snap = (await hm.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  assert.equal(snap.org.seesAllJobs, false);
  assert.deepEqual(snap.jobs.map((j) => j.id), [jobX], "only their job");
  assert.deepEqual(snap.candidates.map((c) => c.email).sort(), [`bo-${run}@example.com`, `vera-${run}@example.com`]);
  assert.ok(snap.applications.every((x) => x.jobId === jobX), "only that job's applications, even for a candidate in both jobs");
  assert.ok(!snap.cvDocuments.some((d) => d.candidateId === hector.id));
  assert.ok(!snap.activities.some((x) => x.candidateId === hector.id || x.jobId === jobY || x.jobId === S.jobA), "no activity about other jobs");
  // ...and can't reach the rest by ID
  assert.equal((await hm.get(`/api/orgs/${S.A.id}/cv/${docOf(hector).id}`)).status, 404);
  assert.equal((await hm.cmd(S.A.id, "applications.move", { id: appOf(hector, jobY).id, stage: "screening" })).status, 404);
  assert.equal((await hm.cmd(S.A.id, "candidates.update", { id: hector.id, patch: { phone: "hacked" } })).status, 404);
  assert.equal((await hm.cmd(S.A.id, "notes.add", { id: id("n"), candidateId: hector.id, body: "peek" })).status, 403);
  assert.equal((await hm.cmd(S.A.id, "applications.create", { id: id("a"), candidateId: vera.id, jobId: jobY })).status, 404, "can't add people to other jobs");
  // Their own job works as usual
  assert.equal((await hm.get(`/api/orgs/${S.A.id}/cv/${docOf(vera).id}`)).status, 200);
  assert.equal((await hm.cmd(S.A.id, "applications.move", { id: appOf(vera, jobX).id, stage: "screening" })).status, 200);
  assert.equal((await hm.cmd(S.A.id, "candidates.create", { id: id("c"), input: { fullName: "No Job", email: `nojob-${run}@example.com` } })).status, 400, "new candidates go into one of their jobs");
  const rita = await hm.cmd(S.A.id, "candidates.create", { id: id("c"), applicationId: id("a"), jobId: jobX, input: { fullName: "Referral Rita", email: `referral-${run}@example.com` } });
  assert.equal(rita.status, 200, JSON.stringify(rita.data));
  assert.equal((await hm.cmd(S.A.id, "candidates.create", { id: id("c"), applicationId: id("a"), jobId: jobY, input: { fullName: "Sneaky Sam", email: `sam-${run}@example.com` } })).status, 404);
  assert.ok(!(await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.candidates.some((c) => c.email === `sam-${run}@example.com`), "nothing half-saved");
  // The interviewer on the first job doesn't see these jobs either
  assert.ok(!(await other.get(`/api/orgs/${S.A.id}/snapshot`)).data.jobs.some((j) => j.id === jobX || j.id === jobY));

  // The database itself enforces it (not just the API)
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const asTenant = async (sql, params = []) => {
    await db.query("begin");
    try {
      await db.query("set local role deceler_app");
      await db.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [S.A.id, hmId]);
      return (await db.query(sql, params)).rows;
    } finally { await db.query("rollback"); }
  };
  assert.equal((await asTenant("select count(*)::int n from candidates where id = $1", [hector.id]))[0].n, 0);
  assert.equal((await asTenant("select count(*)::int n from jobs where id = $1", [jobY]))[0].n, 0);
  assert.equal((await asTenant("select count(*)::int n from cv_documents where candidate_id = $1", [hector.id]))[0].n, 0);
  assert.equal((await asTenant("update candidates set phone = 'x' where id = $1 returning id", [hector.id])).length, 0);
  await db.end();

  // Scheduling an interview adds the interviewer to the job's hiring team
  const ivId = `iv_${crypto.randomBytes(6).toString("hex")}`;
  assert.equal((await owner.cmd(S.A.id, "records.upsert", { kind: "interview", id: ivId, data: { candidateId: hector.id, jobId: jobY, applicationId: appOf(hector, jobY).id, interviewerIds: [hmId], status: "scheduled", start: new Date(Date.now() + 86400000).toISOString() } })).status, 200);
  const after = (await hm.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  assert.deepEqual(after.jobs.map((j) => j.id).sort(), [jobX, jobY].sort());
  assert.ok(after.interviews.some((x) => x.id === ivId));

  // The company can switch it off: then everyone sees every job
  assert.equal((await hm.cmd(S.A.id, "settings.access", { restrictToHiringTeam: false })).status, 403, "admins only");
  assert.equal((await owner.cmd(S.A.id, "settings.access", { restrictToHiringTeam: false })).status, 200);
  const open = (await hm.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  assert.equal(open.org.seesAllJobs, true);
  assert.ok(open.jobs.some((j) => j.id === S.jobA));
  assert.equal((await owner.cmd(S.A.id, "settings.access", { restrictToHiringTeam: true })).status, 200);
});

test("O - a company can hide 'Recruitment powered by Ulysse'", async () => {
  const footer = /<footer[^>]*careers-footer/;
  const page = (u = `/careers/${S.slugA}`) => fetch(BASE + u).then((r) => r.text());
  assert.match(await page(), footer);
  assert.equal((await owner.cmd(S.A.id, "settings.branding", { hidePoweredBy: true })).status, 200);
  assert.doesNotMatch(await page(), footer, "footer hidden");
  assert.doesNotMatch(await page(`/careers/${S.slugA}/${S.jobSlugA}`), footer, "on job pages too");
  assert.equal((await owner.cmd(S.A.id, "settings.branding", { hidePoweredBy: false })).status, 200);
  assert.match(await page(), footer);
});

test("Authentication basics", async () => {
  const anon = client();
  assert.equal((await anon.get("/api/me")).status, 401);
  assert.equal((await anon.get(`/api/orgs/${S.A.id}/snapshot`)).status, 401);
  const bad = await anon.post("/api/auth/login", { email: `owner-${run}@test.example`, password: "wrong-password" });
  assert.equal(bad.status, 401);
  const dup = await anon.post("/api/auth/signup", { name: "Dup", email: `owner-${run}@test.example`, password: "another-password-1" });
  assert.equal(dup.status, 409);
  const crossSite = await fetch(`${BASE}/api/orgs`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  assert.equal(crossSite.status, 403, "cross-origin mutation blocked");
});
