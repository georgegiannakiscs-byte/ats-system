/**
 * Ulysse - account security: two-step verification (TOTP), recovery codes, password change,
 * admin reset of two-step verification.
 * Run against a running server:  BASE_URL=http://localhost:3000 DATABASE_URL=… npm run test:security
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "postgres://deceler:deceler_dev@localhost:5432/deceler";
const run = crypto.randomBytes(3).toString("hex");
// A documentation-range address of our own, so this suite's sign-ups don't use up the shared per-IP limit.
const IP = `198.51.100.${crypto.randomInt(1, 250)}`;

function client() {
  let cookie = "";
  const call = async (method, url, body) => {
    const res = await fetch(BASE + url, { method, redirect: "manual", headers: { "x-forwarded-for": IP, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("deceler_session=")) cookie = c.split(";")[0];
    const ct = res.headers.get("content-type") ?? "";
    return { status: res.status, data: ct.includes("json") ? await res.json() : await res.text() };
  };
  return { get: (u) => call("GET", u), post: (u, b) => call("POST", u, b), del: (u, b) => call("DELETE", u, b), hasCookie: () => !!cookie };
}

// RFC 6238 reference implementation, independent of the server's.
function b32decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s.replace(/\s/g, "")) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, offset = 0) {
  const step = Math.floor(Date.now() / 30000) + offset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}

const PW = "correct-horse-battery-1";
const email = `sec-${run}@test.example`;
const user = client();
const otherDevice = client();
const admin = client();
const S = {};

test("setup - a user signed in on two devices, and a platform admin", async () => {
  assert.equal((await user.post("/api/auth/signup", { name: "Sec User", email, password: PW })).status, 201);
  assert.equal((await otherDevice.post("/api/auth/login", { email, password: PW })).status, 200);
  assert.equal((await admin.post("/api/auth/signup", { name: "Sec Admin", email: `sec-admin-${run}@test.example`, password: PW })).status, 201);
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  await db.query("update users set is_platform_admin = true where email = $1", [`sec-admin-${run}@test.example`]);
  S.userId = (await db.query("select id from users where email = $1", [email])).rows[0].id;
  await db.end();
  assert.deepEqual((await user.get("/api/me/security")).data.twoFactor, { enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
});

test("turning on two-step verification", async () => {
  assert.equal((await user.post("/api/me/two-factor/setup", { password: "wrong-password-123" })).status, 400, "needs the current password");
  const setup = await user.post("/api/me/two-factor/setup", { password: PW });
  assert.equal(setup.status, 200);
  assert.ok(setup.data.qrSvg.startsWith("<svg") && setup.data.uri.startsWith("otpauth://totp/"));
  S.secret = setup.data.secret.replace(/\s/g, "");
  assert.equal((await user.post("/api/me/two-factor/enable", { code: totp(S.secret) === "000000" ? "111111" : "000000" })).status, 400, "wrong code");
  const on = await user.post("/api/me/two-factor/enable", { code: totp(S.secret) });
  assert.equal(on.status, 200);
  assert.equal(on.data.recoveryCodes.length, 10);
  S.recovery = on.data.recoveryCodes;
  assert.equal((await user.get("/api/me/security")).data.twoFactor.enabled, true);
  assert.equal((await user.get("/api/me")).status, 200, "this device stays signed in");
  assert.equal((await otherDevice.get("/api/me")).status, 401, "other devices are signed out");
  // The secret is stored encrypted, and recovery codes only as hashes.
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const row = (await db.query("select totp_secret, totp_recovery_hashes from users where id = $1", [S.userId])).rows[0];
  await db.end();
  assert.ok(row.totp_secret.startsWith("v1.") && !row.totp_secret.includes(S.secret));
  assert.ok(!row.totp_recovery_hashes.some((h) => S.recovery.includes(h)));
});

test("sign-in asks for the second step; codes can't be replayed", async () => {
  const c = client();
  const first = await c.post("/api/auth/login", { email, password: PW });
  assert.equal(first.status, 200);
  assert.equal(first.data.mfaRequired, true);
  assert.equal(c.hasCookie(), false, "no session before the second step");
  assert.equal((await c.get("/api/me")).status, 401);
  assert.equal((await c.post("/api/auth/login/verify", { ticket: first.data.ticket + "x", code: totp(S.secret, 1) })).status, 401, "tampered ticket");
  assert.equal((await c.post("/api/auth/login/verify", { ticket: first.data.ticket, code: "12345x" })).status, 401);
  const code = totp(S.secret, 1); // the enable step used the current window, so use the next one
  assert.equal((await c.post("/api/auth/login/verify", { ticket: first.data.ticket, code })).status, 200);
  assert.equal((await c.get("/api/me")).status, 200);
  assert.equal((await client().post("/api/auth/login/verify", { ticket: first.data.ticket, code })).status, 401, "the same code can't be used twice");
});

test("recovery codes work once each", async () => {
  const c = client();
  const t = (await c.post("/api/auth/login", { email, password: PW })).data.ticket;
  const r = await c.post("/api/auth/login/verify", { ticket: t, code: S.recovery[0].toUpperCase() });
  assert.equal(r.status, 200);
  assert.equal(r.data.recoveryCodesLeft, 9);
  const d = client();
  const t2 = (await d.post("/api/auth/login", { email, password: PW })).data.ticket;
  assert.equal((await d.post("/api/auth/login/verify", { ticket: t2, code: S.recovery[0] })).status, 401);
});

test("new recovery codes replace the old ones", async () => {
  assert.equal((await user.post("/api/me/two-factor/recovery-codes", { code: S.recovery[1] })).status, 400, "needs an app code, not a recovery code");
  // Wait for a fresh 30-second window: both earlier windows have been used.
  await new Promise((r) => setTimeout(r, (30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000));
  const r = await user.post("/api/me/two-factor/recovery-codes", { code: totp(S.secret, 1) });
  assert.equal(r.status, 200);
  assert.equal(r.data.recoveryCodes.length, 10);
  const c = client();
  const t = (await c.post("/api/auth/login", { email, password: PW })).data.ticket;
  assert.equal((await c.post("/api/auth/login/verify", { ticket: t, code: S.recovery[1] })).status, 401, "old codes stop working");
  S.recovery = r.data.recoveryCodes;
});

test("password change needs the current password and signs out other devices", async () => {
  const c = client();
  const t = (await c.post("/api/auth/login", { email, password: PW })).data.ticket;
  const t2 = (await client().post("/api/auth/login", { email, password: PW })).data.ticket;
  assert.equal((await c.post("/api/auth/login/verify", { ticket: t, code: S.recovery[0] })).status, 200);
  assert.equal((await user.post("/api/me/password", { currentPassword: "wrong-password-123", newPassword: "another-long-pass-1" })).status, 400);
  assert.equal((await user.post("/api/me/password", { currentPassword: PW, newPassword: "short" })).status, 400);
  assert.equal((await user.post("/api/me/password", { currentPassword: PW, newPassword: "another-long-pass-1" })).status, 200);
  assert.equal((await user.get("/api/me")).status, 200);
  assert.equal((await c.get("/api/me")).status, 401, "other session signed out");
  assert.equal((await client().post("/api/auth/login/verify", { ticket: t2, code: S.recovery[1] })).status, 401, "a sign-in started with the old password is void");
  assert.equal((await client().post("/api/auth/login", { email, password: PW })).status, 401, "old password no longer works");
});

test("a platform admin can reset two-step verification, with a reason, and it's audited", async () => {
  assert.equal((await user.del(`/api/admin/users/${S.userId}/two-factor`, { reason: "lost phone" })).status, 403, "only platform admins");
  assert.equal((await admin.del(`/api/admin/users/${S.userId}/two-factor`, {})).status, 400, "reason required");
  assert.equal((await admin.del(`/api/admin/users/${S.userId}/two-factor`, { reason: "Lost phone, identity confirmed" })).status, 200);
  assert.equal((await user.get("/api/me")).status, 401, "signed out everywhere");
  const c = client();
  const r = await c.post("/api/auth/login", { email, password: "another-long-pass-1" });
  assert.equal(r.status, 200);
  assert.equal(r.data.mfaRequired, undefined);
  const list = await admin.get(`/api/admin/users?q=${encodeURIComponent(email)}`);
  assert.equal(list.data.users[0].twoFactor, false);
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const actions = (await db.query("select action from audit_logs where target_id = $1 order by created_at", [S.userId])).rows.map((r) => r.action);
  await db.end();
  for (const a of ["user.two_factor_enabled", "user.recovery_code_used", "user.recovery_codes_regenerated", "user.password_changed", "user.two_factor_reset_by_admin"]) assert.ok(actions.includes(a), a);
});

test("turning it off needs the password and a code", async () => {
  const c = client();
  assert.equal((await c.post("/api/auth/signup", { name: "Sec Two", email: `sec2-${run}@test.example`, password: "another-long-pass-1" })).status, 201);
  const setup = await c.post("/api/me/two-factor/setup", { password: "another-long-pass-1" });
  const secret = setup.data.secret.replace(/\s/g, "");
  assert.equal((await c.post("/api/me/two-factor/enable", { code: totp(secret) })).status, 200);
  assert.equal((await c.post("/api/me/two-factor/disable", { password: "another-long-pass-1", code: "000000" })).status, 400);
  assert.equal((await c.post("/api/me/two-factor/disable", { password: "wrong-password-123", code: totp(secret, 1) })).status, 400);
  assert.equal((await c.post("/api/me/two-factor/disable", { password: "another-long-pass-1", code: totp(secret, 1) })).status, 200);
  assert.equal((await c.get("/api/me/security")).data.twoFactor.enabled, false);
});

test("invitation-only sign-up", async () => {
  const set = (policy) => fetch(`${BASE}/api/admin/settings`, { method: "PUT", headers: { "content-type": "application/json", "x-forwarded-for": IP, cookie: S.adminCookie }, body: JSON.stringify({ key: "signup", value: { policy } }) });
  const c = client();
  const login = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": IP }, body: JSON.stringify({ email: `sec-admin-${run}@test.example`, password: PW }) });
  S.adminCookie = login.headers.getSetCookie().find((x) => x.startsWith("deceler_session=")).split(";")[0];
  assert.equal((await set("invite_only")).status, 200);
  try {
    const r = await c.post("/api/auth/signup", { name: "Stranger", email: `stranger-${run}@test.example`, password: PW });
    assert.equal(r.status, 403);
    assert.equal(r.data.code, "invite_only");
  } finally {
    assert.equal((await set("open")).status, 200);
  }
  assert.equal((await client().post("/api/auth/signup", { name: "Stranger", email: `stranger-${run}@test.example`, password: PW })).status, 201, "open again");
});
