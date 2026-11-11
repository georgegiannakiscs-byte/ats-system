/**
 * Demo data for previews (Codespaces): a platform-admin account, the company "Aegean Analytics",
 * two jobs, approved Quick Check questions and a few applications (one with a CV Builder PDF).
 * Idempotent: does nothing if the demo company already exists.
 *   node scripts/seed-demo.mjs   (server must be running; SEED_BASE_URL defaults to localhost:3000)
 * The account is a platform admin only when the server runs with PLATFORM_ADMIN_EMAILS=demo@example.com.
 */
import fs from "node:fs";
import crypto from "node:crypto";
const B = process.env.SEED_BASE_URL ?? "http://localhost:3000";
const FIX = new URL("../tests/fixtures/", import.meta.url);
let cookie = "";
const call = async (method, url, body) => {
  const r = await fetch(B + url, { method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("deceler_session=")) cookie = c.split(";")[0];
  const j = await r.json().catch(() => ({}));
  if (r.status >= 400) throw new Error(`${url} ${r.status} ${JSON.stringify(j)}`);
  return j;
};
await call("POST", "/api/auth/signup", { name: "Demo Admin", email: "demo@example.com", password: "Ulysse-demo-2026" }).catch(() => call("POST", "/api/auth/login", { email: "demo@example.com", password: "Ulysse-demo-2026" }));
const existing = (await call("GET", "/api/me")).companies.find((c) => c.name === "Aegean Analytics");
if (existing) {
  console.log(`Demo data already present (/app/${existing.slug}).`);
  process.exit(0);
}
const org = await call("POST", "/api/orgs", { name: "Aegean Analytics" });
const cmd = (type, payload) => call("POST", `/api/orgs/${org.id}/commands`, { type, payload });
const me = (await call("GET", `/api/orgs/${org.id}/snapshot`)).currentUserId;
const j1 = "j_demoanalyst1", j2 = "j_demosupport1";
await cmd("jobs.create", { id: j1, input: { title: "Marketing Data Analyst", department: "Data", location: "Athens", seniority: "Mid-level", status: "published", recruiterId: me, summary: "Turn marketing data into clear decisions.", responsibilities: "Build dashboards in Looker Studio\nOwn GA4 tracking quality\nPresent weekly insights", requirements: "SQL\nGA4\nClear communication", skills: ["SQL", "GA4", "Looker Studio"] } });
await cmd("jobs.create", { id: j2, input: { title: "Customer Support Lead", location: "Thessaloniki", status: "published", recruiterId: me, skills: ["Zendesk", "Coaching"] } });
const Q = [
  ["Conversions dropped 60% overnight while traffic stayed flat. What do you check first?", "Data quality", ["Rebuild the dashboard", "Check tracking and recent site releases", "Report the drop to leadership as final", "Wait a week for more data"], "B", "Verify the measurement before interpreting the number."],
  ["Two reports show different revenue for the same month. What do you do first?", "Reconciliation", ["Pick the higher number", "Compare definitions, filters and time zones", "Delete one report", "Average the two"], "B", "Differences usually come from definitions or filters."],
  ["A stakeholder asks you to hide an unfavourable trend in a chart. What is the best response?", "Integrity", ["Hide it as asked", "Show it with context and explain the cause", "Refuse to make the chart", "Change the axis to flatten it"], "B", "Present the data honestly, with context."],
  ["A query that ran in 2 seconds now takes 3 minutes after adding a join. What do you look at first?", "SQL", ["Buy a bigger server", "Join keys, row counts and the query plan", "Remove all filters", "Run it at night"], "B", "Check for a fan-out join or missing index."],
];
const qids = [];
for (const [i, [text, comp, opts, key, why]] of Q.entries()) {
  const id = `aq_demo${i}x`; qids.push(id);
  await cmd("assessments.question.save", { id, input: { questionText: text, type: "multiple_choice", options: opts.map((t, k) => ({ id: "ABCD"[k], text: t })), correctOptionId: key, explanation: why, competency: comp, language: "en", jobId: j1 } });
  if (i < 3) await cmd("assessments.question.approve", { id });
}
await cmd("assessments.job.save", { jobId: j1, enabled: true, questionIds: qids.slice(0, 3), timed: true, secondsPerQuestion: 30, language: "en", instructions: "Answer as you would on a normal working day.", allowLater: true, allowExtendedTime: true, allowUntimed: true, notifyRecruiter: true });
const snap = await call("GET", `/api/orgs/${org.id}/snapshot`);
const slug = snap.org.slug, s1 = snap.jobs.find((j) => j.id === j1).slug, s2 = snap.jobs.find((j) => j.id === j2).slug;
const apply = async (jobSlug, fullName, email, extra = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ orgSlug: slug, jobSlug, submissionKey: crypto.randomUUID(), fullName, email, ...extra })) fd.append(k, v);
  if (!extra.generatedCvToken) fd.append("cv", new File([fs.readFileSync(new URL("cv.pdf", FIX))], "cv.pdf", { type: "application/pdf" }));
  return (await fetch(B + "/api/public/apply", { method: "POST", body: fd })).json();
};
// builder CV
const gen = await fetch(B + "/api/public/cv/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgSlug: slug, jobSlug: s1, template: "modern", lang: "en", data: { personal: { fullName: "Eleni Georgiou", email: "eleni.georgiou@example.com", phone: "+30 210 000 0000", location: "Athens", country: "Greece", linkedinUrl: "", portfolioUrl: "", headline: "Data Analyst" }, photoShape: "circle", summary: "Analyst who turns messy marketing data into clear dashboards and decisions.", experience: [{ id: "e1", title: "Data Analyst", company: "Acme Retail", start: "2021", end: "", current: true, description: "", responsibilities: "Weekly KPI reporting\nGA4 tracking audits", achievements: "Cut reporting time by half" }], education: [{ id: "d1", institution: "University of Athens", degree: "BSc", field: "Statistics", start: "2016", end: "2020", description: "" }], skills: ["SQL", "GA4", "Looker Studio"], languages: [{ id: "l1", language: "Greek", level: "Native" }, { id: "l2", language: "English", level: "C2" }], certifications: [], projects: [], additional: { publications: "", awards: "", volunteering: "", links: "", other: "" } }, photo: `data:image/jpeg;base64,${fs.readFileSync(new URL("photo.jpg", FIX)).toString("base64")}` }) }).then((r) => r.json());
const a1 = await apply(s1, "Eleni Georgiou", "eleni.georgiou@example.com", { generatedCvToken: gen.token });
const qc = async (token, answers) => {
  const u = `${B}/api/public/assessments/${token}`;
  const post = (b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
  await post({ action: "start", accommodation: "none" });
  for (const [i, a] of answers.entries()) await post({ action: "answer", position: i, optionId: a });
};
await qc(a1.quickCheck.token, ["B", "B", "B"]);
const a2 = await apply(s1, "Nikos Pappas", "nikos.pappas@example.com", { phone: "+30 690 000 0000", currentTitle: "BI Analyst" });
await qc(a2.quickCheck.token, ["B", "A", "B"]);
await apply(s1, "Maria Konstantinou", "maria.k@example.com");
await apply(s2, "Dimitris Alexiou", "dimitris.a@example.com");
console.log(`Demo data created: /app/${slug} · careers page /careers/${slug}`);
