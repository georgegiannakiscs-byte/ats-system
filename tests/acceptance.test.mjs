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

const file = (name, type) => new File([fs.readFileSync(path.join(FIX, name))], name, { type });
const id = (p) => `${p}_${crypto.randomBytes(8).toString("hex")}`;

async function signup(c, name, email) {
  const r = await c.post("/api/auth/signup", { name, email, password: "correct-horse-battery-1" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

async function apply(orgSlug, jobSlug, fields, cvName = "cv.pdf", cvType = "application/pdf") {
  const fd = new FormData();
  fd.append("orgSlug", orgSlug);
  fd.append("jobSlug", jobSlug);
  fd.append("submissionKey", crypto.randomUUID());
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (cvName) fd.append("cv", file(cvName, cvType));
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

test("B - platform super admin", async () => {
  // The first registered account on a fresh platform is bootstrapped as platform admin in development.
  // Promote the test owner explicitly so this test is independent of ordering.
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("update users set is_platform_admin = true where email = $1", [`owner-${run}@test.example`]);
  await db.end();
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
