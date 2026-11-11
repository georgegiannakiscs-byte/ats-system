/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Browser journey for the CV Builder and Quick Check (Playwright + Chromium).
 *   BASE_URL=http://localhost:3000 node tests/e2e-cv-quick-check.cjs
 * Creates its own company, job and approved questions through the API, then drives the UI:
 * build a CV with a photo → attach → apply → take the Quick Check → review it as the recruiter.
 */
const { chromium } = require("playwright");
const path = require("path");
const crypto = require("crypto");
const assert = require("assert/strict");

const B = process.env.BASE_URL || "http://localhost:3000";
const R = crypto.randomBytes(3).toString("hex");
const FIX = path.join(__dirname, "fixtures");
const log = (...a) => console.log("•", ...a);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const api = page.request;

  // ── Setup through the API (same cookies as the browser) ──
  assert.equal((await api.post(B + "/api/auth/signup", { data: { name: "Journey Owner", email: `journey-${R}@test.example`, password: "correct-horse-battery-1" } })).status(), 201);
  const org = await (await api.post(B + "/api/orgs", { data: { name: `Journey ${R}` } })).json();
  const cmd = async (type, payload) => assert.equal((await api.post(`${B}/api/orgs/${org.id}/commands`, { data: { type, payload } })).status(), 200, type);
  const me = (await (await api.get(`${B}/api/orgs/${org.id}/snapshot`)).json()).currentUserId;
  const jobId = `j_${R}journey`;
  await cmd("jobs.create", { id: jobId, input: { title: "Customer Support Lead", status: "published", recruiterId: me, skills: ["Zendesk", "Coaching"] } });
  const qids = [1, 2, 3].map((i) => `aq_${R}q${i}`);
  for (const [i, id] of qids.entries()) {
    await cmd("assessments.question.save", { id, input: { questionText: `A customer escalates an unresolved refund for the ${["first", "second", "third"][i]} time. What do you do first?`, type: "multiple_choice", options: [{ id: "A", text: "Close the ticket" }, { id: "B", text: "Review the history and own the follow-up" }, { id: "C", text: "Forward it to finance without context" }], correctOptionId: "B", explanation: "Ownership and context first.", competency: "Escalations", language: "en" } });
    await cmd("assessments.question.approve", { id });
  }
  await cmd("assessments.job.save", { jobId, enabled: true, questionIds: qids, timed: true, secondsPerQuestion: 30, language: "en", instructions: "", allowLater: true, allowExtendedTime: true, allowUntimed: true, notifyRecruiter: true });
  const snap = await (await api.get(`${B}/api/orgs/${org.id}/snapshot`)).json();
  const jobUrl = `${B}/careers/${snap.org.slug}/${snap.jobs[0].slug}`;
  log("setup", jobUrl);

  // ── Candidate: CV Builder (separate context = no workspace cookie) ──
  const cctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const c = await cctx.newPage();
  c.on("pageerror", (e) => errors.push(e.message));
  await c.goto(jobUrl);
  await c.fill("#f-fullName", "Anna Journey");
  await c.fill("#f-email", `anna-${R}@example.com`);
  await c.getByRole("tab", { name: "Create my CV" }).click();
  await c.getByRole("button", { name: "Open CV Builder" }).click();
  const d = c.getByRole("dialog");
  assert.equal(await d.getByLabel("Full name", { exact: false }).first().inputValue(), "Anna Journey", "name reused from the form");
  await d.getByLabel("Professional title").fill("Support Team Lead");
  await d.getByRole("button", { name: "Next" }).click();
  await c.setInputFiles('input[aria-label="Add a photo"]', path.join(FIX, "logo-a.png"));
  await d.getByRole("slider").fill("1.6");
  await d.getByRole("button", { name: "Next" }).click();
  await d.getByLabel("Professional summary").fill("I lead support teams and coach agents to resolve complex cases.");
  await d.getByRole("button", { name: "Next" }).click();
  await d.getByRole("button", { name: "Add experience" }).click();
  await d.getByLabel("Job title", { exact: true }).fill("Support Lead");
  await d.getByLabel("Company", { exact: true }).fill("Acme");
  await d.getByRole("button", { name: /Generate/ }).first().click();
  await d.getByText("Modern", { exact: true }).click();
  await d.getByRole("button", { name: "Generate PDF" }).click();
  await d.getByText("Your CV is ready").waitFor({ timeout: 20000 });
  await d.getByRole("button", { name: "Use this CV" }).click();
  await c.getByText("Generated CV").waitFor();
  log("CV generated and attached");
  await c.getByRole("button", { name: "Submit application" }).click();
  await c.getByText("Application received").waitFor({ timeout: 20000 });
  await c.getByRole("link", { name: "Take the Quick Check" }).click();

  // ── Candidate: Quick Check ──
  await c.getByRole("heading", { name: "Quick Check" }).waitFor();
  await c.getByLabel("No time limit").check();
  await c.getByRole("button", { name: "Start Quick Check" }).click();
  for (let i = 1; i <= 3; i++) {
    await c.getByText(`Question ${i} of 3`).waitFor();
    if (i === 2) { await c.reload(); await c.getByText("Question 2 of 3").waitFor(); }
    await c.getByLabel(/Review the history/).check();
    await c.getByRole("button", { name: "Submit answer" }).click();
  }
  await c.getByText("Thank you! Your responses have been submitted successfully.").waitFor();
  log("Quick Check completed");

  // ── Recruiter: review ──
  const after = await (await api.get(`${B}/api/orgs/${org.id}/snapshot`)).json();
  const cand = after.candidates.find((x) => x.email === `anna-${R}@example.com`);
  assert.equal(after.cvDocuments.find((x) => x.candidateId === cand.id).source, "builder");
  assert.equal(after.candidatePhotos.filter((x) => x.candidateId === cand.id).length, 1);
  await page.goto(`${B}/app/${snap.org.slug}/candidates/view?id=${cand.id}&tab=quick-check`);
  await page.getByText("Pending human review").waitFor();
  await page.getByText("3 of 3").waitFor();
  await page.getByText("Untimed (accommodation)").waitFor();
  await page.getByPlaceholder(/What did you take from these answers/).fill("Clear ownership in all three scenarios. Ask about coaching approach.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await page.getByText("Completed", { exact: true }).first().waitFor();
  const app = after.applications.find((x) => x.candidateId === cand.id);
  assert.equal(app.stage, "applied", "Quick Check never moves the candidate");
  log("recruiter review OK");

  // ── Mobile builder ──
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(jobUrl);
  await m.getByRole("tab", { name: "Create my CV" }).click();
  await m.getByRole("button", { name: "Open CV Builder" }).click();
  await m.getByRole("button", { name: "Preview" }).first().click();
  await m.getByText("Live preview", { exact: false }).waitFor();
  log("mobile builder preview OK");

  assert.deepEqual(errors, [], "no page errors");
  await browser.close();
  console.log("\nCV Builder & Quick Check journey: PASS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
