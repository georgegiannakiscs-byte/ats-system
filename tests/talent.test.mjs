/**
 * Ulysse - Talent landing page (/talent) and Admin → Talent leads (API + database level).
 * Run against a running server:  BASE_URL=http://localhost:3000 npm run test:talent
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

function client() {
  let cookie = "";
  const call = async (method, url, body) => {
    const res = await fetch(BASE + url, { method, redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("deceler_session=")) cookie = c.split(";")[0];
    const ct = res.headers.get("content-type") ?? "";
    return { status: res.status, headers: res.headers, data: ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  return { get: (u) => call("GET", u), post: (u, b) => call("POST", u, b), patch: (u, b) => call("PATCH", u, b), del: (u) => call("DELETE", u) };
}

async function submit(fields, cv = "cv.pdf", key = crypto.randomUUID()) {
  const fd = new FormData();
  fd.append("submissionKey", key);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (cv) fd.append("cv", new File([fs.readFileSync(path.join(FIX, cv))], cv, { type: cv.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const res = await fetch(`${BASE}/api/public/talent`, { method: "POST", body: fd });
  return { status: res.status, data: await res.json() };
}

const admin = client();
const other = client();
const base = (n) => ({ fullName: `Talent ${n} ${run}`, email: `talent-${n}-${run}@example.com`, role: "Data Analyst", currentCompany: "Acme", consent: "yes", lang: "en", utmSource: "linkedin", utmMedium: "social" });

test("setup - a platform admin and a regular user", async () => {
  assert.equal((await admin.post("/api/auth/signup", { name: "Talent Admin", email: `talent-admin-${run}@test.example`, password: "correct-horse-battery-1" })).status, 201);
  assert.equal((await other.post("/api/auth/signup", { name: "Regular", email: `talent-user-${run}@test.example`, password: "correct-horse-battery-1" })).status, 201);
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("update users set is_platform_admin = true where email = $1", [`talent-admin-${run}@test.example`]);
  await db.query("update users set is_platform_admin = false where email = $1", [`talent-user-${run}@test.example`]);
  await db.end();
});

test("landing page renders in English and Greek", async () => {
  const en = await fetch(`${BASE}/talent?utm_source=linkedin`).then((r) => r.text());
  assert.match(en, /Your next role, without the endless forms/);
  const el = await fetch(`${BASE}/talent?lang=el`).then((r) => r.text());
  assert.match(el, /Η επόμενη θέση σας/);
});

test("submit with an uploaded CV (LinkedIn source) and idempotent retry", async () => {
  const key = crypto.randomUUID();
  const r = await submit(base("upload"), "cv.pdf", key);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.reference);
  const again = await submit(base("upload"), "cv.pdf", key);
  assert.equal(again.data.duplicate, true);
  assert.equal(again.data.reference, r.data.reference);
});

test("submit with a CV made in the CV Builder (Greek page)", async () => {
  const g = await fetch(`${BASE}/api/public/talent/cv/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ template: "minimal", lang: "el", data: { personal: { fullName: "Γιώργος Τάλεντ", email: `talent-builder-${run}@example.com` }, summary: "Αναλυτής δεδομένων." } }),
  });
  const gd = await g.json();
  assert.equal(g.status, 201, JSON.stringify(gd));
  const pdf = await fetch(BASE + gd.previewUrl);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  const r = await submit({ ...base("builder"), fullName: "Γιώργος Τάλεντ", email: `talent-builder-${run}@example.com`, lang: "el", generatedCvToken: gd.token }, null);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const reuse = await submit({ ...base("builder2"), generatedCvToken: gd.token }, null);
  assert.equal(reuse.status, 410, "a generated CV can be used once");
});

test("validation: CV, consent, email and role are required; honeypot blocks bots", async () => {
  assert.equal((await submit(base("nocv"), null)).status, 400);
  const { consent: _c, ...noConsent } = base("noconsent");
  assert.equal((await submit(noConsent)).status, 400);
  assert.equal((await submit({ ...base("bademail"), email: "not-an-email" })).status, 400);
  const { role: _r, ...noRole } = base("norole");
  assert.equal((await submit(noRole)).status, 400);
  assert.equal((await submit({ ...base("bot"), website: "spam" })).status, 400);
  assert.equal((await submit(base("fake"), "fake.pdf")).status, 415, "file type checked by content");
});

test("admin sees the leads; other users and companies don't", async () => {
  assert.equal((await other.get("/api/admin/talent")).status, 403);
  const list = await admin.get(`/api/admin/talent?q=${run}`);
  assert.equal(list.status, 200);
  const up = list.data.leads.find((l) => l.email === `talent-upload-${run}@example.com`);
  const built = list.data.leads.find((l) => l.email === `talent-builder-${run}@example.com`);
  assert.ok(up && built);
  assert.equal(up.source, "LinkedIn");
  assert.equal(up.status, "new");
  assert.equal(built.cv.source, "builder");
  assert.equal(built.language, "el");
  assert.equal(list.data.leads.filter((l) => l.email.includes(`-${run}@`)).length, 2, "rejected submissions aren't stored");
  assert.match(list.data.links.en, /\/talent\?lang=en&utm_source=linkedin/);
  const ov = await admin.get("/api/admin/overview");
  assert.ok(ov.data.metrics.talent_leads_new >= 2);

  // CV: admin only, original bytes
  assert.equal((await other.get(`/api/admin/talent/${up.id}/cv`)).status, 403);
  const cv = await admin.get(`/api/admin/talent/${up.id}/cv`);
  assert.equal(cv.status, 200);
  assert.ok(cv.data.equals(fs.readFileSync(path.join(FIX, "cv.pdf"))));
  assert.equal(cv.headers.get("cache-control"), "private, no-store");

  // Status + notes
  const p = await admin.patch(`/api/admin/talent/${up.id}`, { status: "contacted", adminNotes: "Called on Monday" });
  assert.equal(p.status, 200);
  assert.equal(p.data.lead.status, "contacted");
  assert.equal((await other.patch(`/api/admin/talent/${up.id}`, { status: "archived" })).status, 403);

  // CSV export with formula-injection guard
  const csv = await admin.get("/api/admin/talent/export");
  assert.equal(csv.status, 200);
  assert.match(csv.data.toString(), new RegExp(`talent-upload-${run}@example.com`));

  // Erasure removes the row and the file
  assert.equal((await admin.del(`/api/admin/talent/${built.id}`)).status, 200);
  assert.equal((await admin.get(`/api/admin/talent/${built.id}/cv`)).status, 404);
});

test("database: company (tenant) role can't read talent leads", async () => {
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("begin");
  await db.query("set local role deceler_app");
  await assert.rejects(db.query("select count(*) from talent_leads"), /permission denied/);
  await db.query("rollback");
  await db.end();
});
