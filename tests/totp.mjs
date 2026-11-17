// Two-step verification helpers for the API suites (independent RFC 6238 implementation).
import crypto from "node:crypto";

function b32decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s.replace(/\s/g, "")) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export function totp(secret, offset = 0) {
  const step = Math.floor(Date.now() / 30000) + offset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}

/** Turns on two-step verification for the signed-in client. Returns the secret and recovery codes. */
export async function enableTwoFactor(c, password) {
  const setup = await c.post("/api/me/two-factor/setup", { password });
  if (setup.status !== 200) throw new Error(`2FA setup failed: ${setup.status}`);
  const secret = setup.data.secret.replace(/\s/g, "");
  const on = await c.post("/api/me/two-factor/enable", { code: totp(secret) });
  if (on.status !== 200) throw new Error(`2FA enable failed: ${on.status}`);
  return { secret, recoveryCodes: [...on.data.recoveryCodes] };
}
