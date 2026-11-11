/**
 * Ulysse — CV Builder & Quick Check acceptance tests (API + database level), scenarios A–G.
 *
 * Run against a server started with a local Anthropic stub (no real API calls, no key needed):
 *   ANTHROPIC_API_KEY=stub-key ANTHROPIC_BASE_URL=http://127.0.0.1:4599 npm run dev
 *   npm run test:quick-check
 * The stub lets us verify the request we send (model, structured output schema, job-only prompt)
 * and how responses are validated. It does NOT prove behaviour against the real Claude API.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "postgres://deceler:deceler_dev@localhost:5432/deceler";
const STUB_PORT = Number(process.env.ANTHROPIC_STUB_PORT ?? 4599);
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const run = crypto.randomBytes(3).toString("hex");

/* ───────── Anthropic API stub ───────── */
const stubRequests = [];
const mcq = (text, competency, key = "B") => ({
  question_text: text, type: "multiple_choice", competency, difficulty: "medium", recommended_time_seconds: 30, language: "en",
  options: [{ id: "A", text: "Ignore it until the weekly review" }, { id: "B", text: "Check the source data and tracking first" }, { id: "C", text: "Report the number as final" }, { id: "D", text: "Delete the dashboard" }],
  correct_answer: key, explanation: "Verify the data before acting on it.",
});
function stubReply(body) {
  const sys = typeof body.system === "string" ? body.system : JSON.stringify(body.system);
  const prompt = JSON.stringify(body.messages);
  if (sys.includes("Quick Check, a 2-minute")) {
    return { questions: [
      mcq("Yesterday's conversions dropped 60% on the dashboard while traffic was flat. What do you check first?", "Data quality"),
      mcq("A stakeholder asks for a chart that hides an unfavourable trend. What is the best response?", "Integrity", "B"),
      mcq("A SQL query that ran in 2s now takes 3 minutes after a new join. What do you look at first?", "SQL", "B"),
      mcq("Two reports show different revenue totals for the same month. What do you do first?", "Reconciliation", "B"),
      { ...mcq("Which option is right?", "Broken", "Z") }, // invalid key → must be rejected by our validator
    ] };
  }
  if (sys.includes("professional summary")) {
    if (prompt.includes("INVENT")) return { suggestion: "Analyst with 10 years of experience leading teams.", notes: "Rewrote." };
    return { suggestion: "Data analyst who turns messy data into clear decisions for marketing teams.", notes: "Tightened wording." };
  }
  if (sys.includes("Extract the structured contents")) {
    return { fullName: "Stub Person", email: "", phone: "", location: "Athens", linkedinUrl: "", portfolioUrl: "", headline: "Analyst", summary: "", experience: [{ title: "Analyst", company: "Acme", start: "2020", end: "", current: true, description: "" }], education: [], skills: ["SQL"], languages: [], certifications: [] };
  }
  if (sys.includes("written answer")) return { addresses_scenario: "partially", relevant_concepts: ["tracking"], areas_to_clarify: ["which tools"], follow_up_questions: ["How would you validate the fix?"] };
  return {};
}
const stub = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    stubRequests.push({ url: req.url, headers: req.headers, body });
    res.writeHead(200, { "content-type": "application/json", "request-id": "req_stub" });
    res.end(JSON.stringify({ id: "msg_stub", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify(stubReply(body)) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 400 } }));
  });
});
await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r));
after(() => stub.close());

/* ───────── helpers ───────── */
function client() {
  let cookie = "";
  const call = async (method, url, body, isForm) => {
    const res = await fetch(BASE + url, { method, redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...(body && !isForm ? { "content-type": "application/json" } : {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("deceler_session=")) cookie = c.split(";")[0];
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };
  return { get: (u) => call("GET", u), post: (u, b) => call("POST", u, b), form: (u, fd) => call("POST", u, fd, true), cmd: (org, type, payload) => call("POST", `/api/orgs/${org}/commands`, { type, payload }) };
}
const pub = { post: async (u, b) => { const r = await fetch(BASE + u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, data: await r.json() }; }, get: async (u) => { const r = await fetch(BASE + u); const ct = r.headers.get("content-type") ?? ""; return { status: r.status, headers: r.headers, data: ct.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) }; } };
const file = (name, type) => new File([fs.readFileSync(path.join(FIX, name))], name, { type });
const id = (p) => `${p}_${crypto.randomBytes(8).toString("hex")}`;
async function apply(orgSlug, jobSlug, fields, cv = "cv.pdf") {
  const fd = new FormData();
  fd.append("orgSlug", orgSlug); fd.append("jobSlug", jobSlug); fd.append("submissionKey", crypto.randomUUID());
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (cv) fd.append("cv", file(cv, "application/pdf"));
  const res = await fetch(`${BASE}/api/public/apply`, { method: "POST", body: fd });
  return { status: res.status, data: await res.json() };
}
const cvData = (fullName, email, extra = {}) => ({
  personal: { fullName, email, phone: "+30 210 000 0000", location: "Athens", country: "Greece", linkedinUrl: "", portfolioUrl: "", headline: "Data Analyst" },
  photoShape: "circle", summary: "I analyse marketing data and build dashboards.",
  experience: [{ id: "e1", title: "Data Analyst", company: "Acme", start: "2021", end: "", current: true, description: "Dashboards and reporting.", responsibilities: "Weekly KPI reports\nGA4 tracking", achievements: "" }],
  education: [{ id: "d1", institution: "University of Athens", degree: "BSc", field: "Statistics", start: "2016", end: "2020", description: "" }],
  skills: ["SQL", "GA4", "Looker Studio"], languages: [{ id: "l1", language: "Greek", level: "Native" }, { id: "l2", language: "English", level: "C2" }],
  certifications: [], projects: [], additional: { publications: "", awards: "", volunteering: "", links: "", other: "" }, ...extra,
});
const photoDataUrl = `data:image/png;base64,${fs.readFileSync(path.join(FIX, "logo-a.png")).toString("base64")}`;

const owner = client();
const other = client();
const S = {};

test("setup — two companies, a published job each", async () => {
  assert.equal((await owner.post("/api/auth/signup", { name: "Owner", email: `qc-owner-${run}@test.example`, password: "correct-horse-battery-1" })).status, 201);
  assert.equal((await other.post("/api/auth/signup", { name: "Other", email: `qc-other-${run}@test.example`, password: "correct-horse-battery-1" })).status, 201);
  S.A = (await owner.post("/api/orgs", { name: `QC Alpha ${run}` })).data;
  S.B = (await other.post("/api/orgs", { name: `QC Beta ${run}` })).data;
  S.jobA = id("j"); S.jobB = id("j");
  assert.equal((await owner.cmd(S.A.id, "jobs.create", { id: S.jobA, input: { title: "Marketing Data Analyst", seniority: "Mid-level", status: "published", skills: ["SQL", "GA4"], requirements: "SQL, GA4, dashboarding" } })).status, 200);
  assert.equal((await other.cmd(S.B.id, "jobs.create", { id: S.jobB, input: { title: "Store Manager", status: "published" } })).status, 200);
  let a = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  await owner.cmd(S.A.id, "jobs.update", { id: S.jobA, patch: { recruiterId: a.currentUserId } });
  a = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const b = (await other.get(`/api/orgs/${S.B.id}/snapshot`)).data;
  S.slugA = a.org.slug; S.jobSlugA = a.jobs[0].slug; S.slugB = b.org.slug; S.jobSlugB = b.jobs[0].slug;
});

test("A — apply with an existing CV (Quick Check not configured: application still complete)", async () => {
  const r = await apply(S.slugA, S.jobSlugA, { fullName: "Maria Upload", email: `upload-${run}@example.com` });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.cvSource, "upload");
  assert.equal(r.data.quickCheck, null);
  S.appUpload = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data.applications.find((x) => x.candidateId)?.id;
});

test("B — CV Builder with photo: generate, preview, attach, submit", async () => {
  const g = await pub.post("/api/public/cv/generate", { orgSlug: S.slugA, jobSlug: S.jobSlugA, template: "modern", lang: "en", data: cvData("Eleni Builder", `builder-${run}@example.com`), photo: photoDataUrl });
  assert.equal(g.status, 201, JSON.stringify(g.data));
  assert.match(g.data.fileName, /Eleni_Builder_CV\.pdf/);
  const pdf = await pub.get(g.data.previewUrl);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(pdf.data.subarray(0, 5).toString(), "%PDF-", "a real PDF, not an image");
  assert.equal(pdf.headers.get("cache-control"), "private, no-store");

  const r = await apply(S.slugA, S.jobSlugA, { fullName: "Eleni Builder", email: `builder-${run}@example.com`, generatedCvToken: g.data.token }, null);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.cvSource, "builder");
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const c = snap.candidates.find((x) => x.email === `builder-${run}@example.com`);
  assert.ok(c);
  assert.equal(c.headline, "Data Analyst");
  assert.deepEqual(c.skills, ["SQL", "GA4", "Looker Studio"]);
  assert.equal(c.experience[0].company, "Acme");
  const doc = snap.cvDocuments.find((d) => d.candidateId === c.id);
  assert.equal(doc.source, "builder");
  assert.equal(doc.mimeType, "application/pdf");
  assert.ok(snap.cvBuilderProfiles.some((p) => p.candidateId === c.id && p.template === "modern"));
  const photo = snap.candidatePhotos.find((p) => p.candidateId === c.id);
  assert.ok(photo, "optional photo stored separately");
  const ph = await owner.get(`/api/orgs/${S.A.id}/photos/${photo.id}`);
  assert.equal(ph.status, 200);
  assert.equal(ph.headers.get("content-type"), "image/jpeg", "photo re-encoded (metadata stripped)");
  S.photoA = photo.id;
  // The recruiter downloads exactly the generated PDF
  const u = await owner.get(`/api/orgs/${S.A.id}/cv/${doc.id}`);
  const bytes = await owner.get(u.data.url);
  assert.ok(bytes.data.equals(pdf.data));
  // A generated CV can only be used once
  const again = await apply(S.slugA, S.jobSlugA, { fullName: "Eleni Builder", email: `builder2-${run}@example.com`, generatedCvToken: g.data.token }, null);
  assert.equal(again.status, 410);
});

test("C — CV Builder without photo (Greek, minimal template) and photo hiding", async () => {
  const g = await pub.post("/api/public/cv/generate", { orgSlug: S.slugA, jobSlug: S.jobSlugA, template: "minimal", lang: "el", data: cvData("Γιώργος Παπαδόπουλος", `greek-${run}@example.com`, { summary: "Αναλυτής δεδομένων με εμπειρία στο μάρκετινγκ." }) });
  assert.equal(g.status, 201, JSON.stringify(g.data));
  const r = await apply(S.slugA, S.jobSlugA, { fullName: "Γιώργος Παπαδόπουλος", email: `greek-${run}@example.com`, generatedCvToken: g.data.token }, null);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const c = snap.candidates.find((x) => x.email === `greek-${run}@example.com`);
  assert.equal(snap.candidatePhotos.filter((p) => p.candidateId === c.id).length, 0, "no photo required or stored");
  // Required fields are enforced by the builder too
  const bad = await pub.post("/api/public/cv/generate", { orgSlug: S.slugA, jobSlug: S.jobSlugA, template: "minimal", data: cvData("", "not-an-email") });
  assert.equal(bad.status, 400);
  // No file and no generated CV → rejected; name + email + CV are the only requirements
  assert.equal((await apply(S.slugA, S.jobSlugA, { fullName: "No CV", email: `nocv-${run}@example.com` }, null)).status, 400);
  // Company hides photos during screening → photo endpoint refuses
  assert.equal((await owner.cmd(S.A.id, "settings.cvBuilder", { hidePhotos: true })).status, 200);
  assert.equal((await owner.get(`/api/orgs/${S.A.id}/photos/${S.photoA}`)).status, 403);
  // Template restrictions are enforced server-side
  assert.equal((await owner.cmd(S.A.id, "settings.cvBuilder", { templates: ["minimal"], defaultTemplate: "minimal" })).status, 200);
  const blocked = await pub.post("/api/public/cv/generate", { orgSlug: S.slugA, jobSlug: S.jobSlugA, template: "modern", data: cvData("Some One", `t-${run}@example.com`) });
  assert.equal(blocked.status, 400);
  await owner.cmd(S.A.id, "settings.cvBuilder", { templates: ["minimal", "modern", "professional"], hidePhotos: false });
});

const Q = (text, competency) => ({ questionText: text, type: "multiple_choice", competency, options: [{ id: "A", text: "Wait and see" }, { id: "B", text: "Check the tracking setup first" }, { id: "C", text: "Publish the numbers" }, { id: "D", text: "Rebuild the dashboard" }], correctOptionId: "B", explanation: "Verify first.", recommendedTimeSeconds: 30, language: "en" });

test("D — Quick Check: configure, apply, answer with server-side timing", async () => {
  S.q = [id("aq"), id("aq"), id("aq"), id("aq")];
  for (const [i, qid] of S.q.entries()) assert.equal((await owner.cmd(S.A.id, "assessments.question.save", { id: qid, input: Q(`Scenario ${i + 1}: conversions dropped sharply overnight. What do you do first?`, "Data quality") })).status, 200);
  const cfg = { jobId: S.jobA, enabled: true, questionIds: S.q, timed: true, secondsPerQuestion: 30, language: "en", instructions: "Answer as you would at work.", allowLater: true, allowExtendedTime: true, allowUntimed: true, notifyRecruiter: true };
  const notApproved = await owner.cmd(S.A.id, "assessments.job.save", cfg);
  assert.equal(notApproved.status, 400, "drafts can't be used");
  for (const qid of S.q) assert.equal((await owner.cmd(S.A.id, "assessments.question.approve", { id: qid })).status, 200);
  assert.equal((await owner.cmd(S.A.id, "assessments.job.save", { ...cfg, questionIds: S.q.slice(0, 2) })).status, 400, "needs 3–4 questions");
  assert.equal((await owner.cmd(S.A.id, "assessments.job.save", cfg)).status, 200);

  const r = await apply(S.slugA, S.jobSlugA, { fullName: "Kostas Check", email: `check-${run}@example.com` });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.quickCheck?.token, "Quick Check offered after a successful application");
  assert.equal(r.data.quickCheck.questions, 4);
  const T = r.data.quickCheck.token;
  S.tokenD = T;
  const url = `/api/public/assessments/${T}`;

  const intro = await pub.get(url);
  assert.equal(intro.status, 200);
  assert.equal(intro.data.status, "invited");
  assert.equal(intro.data.current, null, "timer does not start before the candidate starts");
  assert.equal(intro.data.total, 4);

  let s = (await pub.post(url, { action: "start", accommodation: "none" })).data;
  assert.equal(s.status, "started");
  assert.equal(s.current.position, 0);
  assert.ok(s.current.remainingMs > 25_000 && s.current.remainingMs <= 30_000);
  assert.ok(!JSON.stringify(s).includes("correctOptionId") && !JSON.stringify(s).includes("Verify first"), "answer key never sent to the candidate");

  // Reload does not reset the clock
  const reload = (await pub.get(url)).data;
  assert.equal(reload.current.deadlineAt, s.current.deadlineAt);

  s = (await pub.post(url, { action: "answer", position: 0, optionId: "B" })).data;
  assert.equal(s.current.position, 1);
  // Answer for an old position is not recorded
  const stale = (await pub.post(url, { action: "answer", position: 0, optionId: "A" })).data;
  assert.equal(stale.late, true);

  // Question 2's deadline passes (simulated server-side) → recorded as unanswered, next question served
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("select set_config('app.bypass', 'on', false)"); // test-only: act as the system context
  await db.query("update assessment_responses set deadline_at = now() - interval '10 seconds' where position = 1 and attempt_id = (select id from assessment_attempts where application_id = (select id from applications where candidate_id = (select id from candidates where email = $1)))", [`check-${run}@example.com`]);
  s = (await pub.get(url)).data;
  assert.equal(s.current.position, 2, "timed-out question skipped");
  const late = (await pub.post(url, { action: "answer", position: 1, optionId: "B" })).data;
  assert.equal(late.late, true, "answers after the deadline are not accepted");

  s = (await pub.post(url, { action: "answer", position: 2, optionId: "A" })).data;
  s = (await pub.post(url, { action: "answer", position: 3, optionId: "B" })).data;
  assert.equal(s.status, "completed");
  assert.equal((await pub.post(url, { action: "start" })).status, 409);

  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const c = snap.candidates.find((x) => x.email === `check-${run}@example.com`);
  const app = snap.applications.find((x) => x.candidateId === c.id);
  const at = snap.assessmentAttempts.find((x) => x.applicationId === app.id);
  assert.equal(at.status, "completed");
  assert.deepEqual(at.responses.map((x) => x.isCorrect ?? null), [true, null, false, true], "deterministic key comparison");
  assert.deepEqual(at.responses.map((x) => x.timedOut), [false, true, false, false]);
  assert.equal(app.stage, "applied", "never auto-advanced");
  assert.equal(app.status, "active", "never auto-rejected");
  assert.ok(snap.notifications.some((n) => n.title === "Quick Check completed"), "recruiter notified");
  S.appCheck = app.id;

  // Decline path; the application stays valid
  const r2 = await apply(S.slugA, S.jobSlugA, { fullName: "Dimitra Later", email: `later-${run}@example.com` });
  const d = await pub.post(`/api/public/assessments/${r2.data.quickCheck.token}`, { action: "decline" });
  assert.equal(d.data.status, "declined");

  // Recruiter invite for an earlier application ("complete later" link); re-invite replaces the link
  const inv = await owner.post(`/api/orgs/${S.A.id}/assessments/invite`, { applicationId: S.appUpload, sendEmail: true });
  assert.equal(inv.status, 201, JSON.stringify(inv.data));
  const inv2 = await owner.post(`/api/orgs/${S.A.id}/assessments/invite`, { applicationId: S.appUpload, sendEmail: false });
  const oldTok = inv.data.url.split("/assess/")[1];
  const newTok = inv2.data.url.split("/assess/")[1];
  assert.equal((await pub.get(`/api/public/assessments/${oldTok}`)).status, 404);
  assert.equal((await pub.get(`/api/public/assessments/${newTok}`)).status, 200);
  assert.equal((await owner.post(`/api/orgs/${S.A.id}/assessments/invite`, { applicationId: S.appCheck })).status, 409, "completed checks are not re-sent");

  // Export (CSV) with formula-injection protection
  const csv = await owner.get(`/api/orgs/${S.A.id}/assessments/export?jobId=${S.jobA}`);
  assert.equal(csv.status, 200);
  assert.match(csv.data.toString(), /Kostas Check/);
  await db.end();
});

test("F — accessibility: extended time and untimed mode, without penalty", async () => {
  const ext = await apply(S.slugA, S.jobSlugA, { fullName: "Anna Extended", email: `ext-${run}@example.com` });
  let s = (await pub.post(`/api/public/assessments/${ext.data.quickCheck.token}`, { action: "start", accommodation: "extended" })).data;
  assert.equal(s.accommodation, "extended");
  assert.ok(s.current.remainingMs > 55_000, "double time");
  const un = await apply(S.slugA, S.jobSlugA, { fullName: "Petros Untimed", email: `untimed-${run}@example.com` });
  s = (await pub.post(`/api/public/assessments/${un.data.quickCheck.token}`, { action: "start", accommodation: "untimed" })).data;
  assert.equal(s.current.deadlineAt, null, "no deadline");
  // Skipping is recorded the same way as an unanswered question
  s = (await pub.post(`/api/public/assessments/${un.data.quickCheck.token}`, { action: "skip", position: 0 })).data;
  assert.equal(s.current.position, 1);
  // When the company does not offer untimed mode the request is refused with guidance
  await owner.cmd(S.A.id, "assessments.job.save", { jobId: S.jobA, enabled: true, questionIds: S.q, timed: true, secondsPerQuestion: 30, language: "en", instructions: "", allowLater: true, allowExtendedTime: true, allowUntimed: false, notifyRecruiter: true });
  const no = await apply(S.slugA, S.jobSlugA, { fullName: "Lena NoUntimed", email: `nountimed-${run}@example.com` });
  const refused = await pub.post(`/api/public/assessments/${no.data.quickCheck.token}`, { action: "start", accommodation: "untimed" });
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /Contact the company/);
});

test("E — Anthropic question generation (stub): drafts only, job data only, validated", async (t) => {
  const snap = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  if (!snap.ai.configured) {
    const r = await owner.post(`/api/orgs/${S.A.id}/assessments/generate`, { jobId: S.jobA, count: 4 });
    assert.equal(r.status, 503);
    assert.match(r.data.error, /not configured/);
    const gen = await pub.post("/api/public/cv/generate", { orgSlug: S.slugA, jobSlug: S.jobSlugA, template: "minimal", data: cvData("Text Source", `source-${run}@example.com`) });
    const fd = new FormData();
    fd.append("orgSlug", S.slugA); fd.append("jobSlug", S.jobSlugA); fd.append("cv", new File([(await pub.get(gen.data.previewUrl)).data], "cv.pdf", { type: "application/pdf" }));
    const ex = await (await fetch(`${BASE}/api/public/cv/extract`, { method: "POST", body: fd })).json();
    assert.equal(ex.method, "contact_only");
    assert.equal(ex.prefill.email, `source-${run}@example.com`);
    t.diagnostic("AI not configured on the server under test — verified graceful fallbacks only.");
    return;
  }
  stubRequests.length = 0;
  const r = await owner.post(`/api/orgs/${S.A.id}/assessments/generate`, { jobId: S.jobA, count: 4, language: "en" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.ids.length, 4);
  assert.equal(r.data.rejected.length, 1, "malformed question rejected deterministically");
  const req = stubRequests.at(-1);
  assert.match(req.url, /\/v1\/messages/);
  assert.ok(req.headers["x-api-key"] === "stub-key" || /stub-key/.test(req.headers.authorization ?? ""), `key sent server-side only: ${JSON.stringify(Object.keys(req.headers))}`);
  assert.ok(req.body.output_config?.format?.type === "json_schema", "structured output schema sent");
  const prompt = JSON.stringify(req.body.messages);
  assert.match(prompt, /Marketing Data Analyst/);
  assert.ok(!prompt.includes("@example.com") && !prompt.includes("Kostas"), "no candidate data in the prompt");
  const after = (await owner.get(`/api/orgs/${S.A.id}/snapshot`)).data;
  const gen = after.assessmentQuestions.filter((x) => r.data.ids.includes(x.id));
  assert.ok(gen.every((x) => x.status === "draft" && x.source === "ai" && x.generationVersion && x.aiModel), "saved as drafts with model + version");
  // Drafts can't be used until approved
  const cfg = { jobId: S.jobA, enabled: true, questionIds: r.data.ids, timed: true, secondsPerQuestion: 30, language: "en", instructions: "", allowLater: true, allowExtendedTime: true, allowUntimed: true, notifyRecruiter: true };
  assert.equal((await owner.cmd(S.A.id, "assessments.job.save", cfg)).status, 400);

  // Summary help: suggestion returned for approval; invented figures are discarded
  const ok = await pub.post("/api/public/cv/improve-summary", { orgSlug: S.slugA, jobSlug: S.jobSlugA, summary: "i do data stuff for marketing and dashboards", skills: ["SQL"] });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(ok.data.suggestion);
  const inv = await pub.post("/api/public/cv/improve-summary", { orgSlug: S.slugA, jobSlug: S.jobSlugA, summary: "INVENT something about my analyst work" });
  assert.equal(inv.status, 422);
  // "Create a new CV from this file": suggestions only, nothing stored
  const srcGen = await pub.post("/api/public/cv/generate", { orgSlug: S.slugA, jobSlug: S.jobSlugA, template: "minimal", data: cvData("Text Source", `source-${run}@example.com`) });
  const srcPdf = (await pub.get(srcGen.data.previewUrl)).data;
  const fd = new FormData();
  fd.append("orgSlug", S.slugA); fd.append("jobSlug", S.jobSlugA); fd.append("cv", new File([srcPdf], "cv.pdf", { type: "application/pdf" }));
  const ex = await fetch(`${BASE}/api/public/cv/extract`, { method: "POST", body: fd });
  const exData = await ex.json();
  assert.equal(ex.status, 200, JSON.stringify(exData));
  assert.equal(exData.method, "ai");
  assert.equal(exData.prefill.email, `source-${run}@example.com`, "contact details found deterministically from the PDF text");
  assert.equal(exData.prefill.experience[0].company, "Acme");
  assert.ok(!JSON.stringify(stubRequests.at(-1).body).includes("data:image"), "no images sent to AI");
  // Usage is tracked per company
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("select set_config('app.bypass', 'on', false)");
  const u = (await db.query("select feature, status, cost_usd from ai_usage where org_id = $1", [S.A.id])).rows;
  assert.ok(u.some((x) => x.feature === "question_generation" && x.status === "ok" && Number(x.cost_usd) > 0));
  await db.end();
});

test("G — company isolation for CVs, questions, attempts and results", async () => {
  const b = (await other.get(`/api/orgs/${S.B.id}/snapshot`)).data;
  assert.equal(b.assessmentQuestions.length, 0);
  assert.equal(b.assessmentAttempts.length, 0);
  assert.equal(b.cvBuilderProfiles.length, 0);
  assert.equal(b.candidatePhotos.length, 0);
  assert.equal((await other.get(`/api/orgs/${S.A.id}/snapshot`)).status, 404);
  assert.equal((await other.post(`/api/orgs/${S.B.id}/assessments/invite`, { applicationId: S.appCheck })).status, 404);
  assert.equal((await other.get(`/api/orgs/${S.B.id}/photos/${S.photoA}`)).status, 404);
  assert.equal((await other.cmd(S.B.id, "assessments.question.approve", { id: S.q[0] })).status, 404);
  const csv = await other.get(`/api/orgs/${S.B.id}/assessments/export`);
  assert.ok(!csv.data.toString().includes("Kostas"));
  // A CV generated on Company A's job can't be attached to Company B's job
  const g = await pub.post("/api/public/cv/generate", { orgSlug: S.slugA, jobSlug: S.jobSlugA, template: "minimal", data: cvData("Cross Tenant", `cross-${run}@example.com`) });
  assert.equal((await apply(S.slugB, S.jobSlugB, { fullName: "Cross Tenant", email: `cross-${run}@example.com`, generatedCvToken: g.data.token }, null)).status, 410);
  // Database level (RLS)
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const [{ id: otherId }] = (await db.query("select id from users where email = $1", [`qc-other-${run}@test.example`])).rows;
  for (const t of ["assessment_questions", "assessment_attempts", "assessment_responses", "job_assessments", "cv_builder_profiles", "candidate_photos", "cv_drafts", "assessment_observations"]) {
    await db.query("begin");
    await db.query("set local role deceler_app");
    await db.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [S.B.id, otherId]);
    const n = (await db.query(`select count(*)::int n from ${t} where org_id = $1`, [S.A.id])).rows[0].n;
    await db.query("rollback");
    assert.equal(n, 0, `${t} isolated`);
  }
  await db.query("begin");
  await db.query("set local role deceler_app");
  await db.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [S.B.id, otherId]);
  await assert.rejects(db.query("select count(*) from ai_usage"), /permission denied/);
  await db.query("rollback");
  await db.end();
});
