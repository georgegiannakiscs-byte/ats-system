import "server-only";
import { sys } from "./db";
import { HttpError } from "./http";
import { sha256, signPayload, verifyPayload } from "./security";
import { decryptSecret, hashRecoveryCode, normaliseRecoveryCode, verifyTotp } from "./totp";

type Row = { totp_secret: string | null; totp_enabled_at: Date | null; totp_last_step: string; totp_recovery_hashes: string[] };

export async function twoFactorStatus(userId: string) {
  const [r] = await sys<Row>("select totp_secret, totp_enabled_at, totp_last_step, totp_recovery_hashes from users where id = $1", [userId]);
  return { enabled: !!r?.totp_enabled_at, enabledAt: r?.totp_enabled_at ?? null, recoveryCodesLeft: r?.totp_recovery_hashes.length ?? 0 };
}

/**
 * Checks a second factor: a 6-digit authenticator code, or (if allowRecovery) a one-time recovery code.
 * Both are consumed atomically, so the same code can never be accepted twice, even in parallel requests.
 */
export async function checkSecondFactor(userId: string, input: string, { allowRecovery = true } = {}): Promise<"totp" | "recovery" | null> {
  const code = input.replace(/\s/g, "");
  const [r] = await sys<Row>("select totp_secret, totp_enabled_at, totp_last_step, totp_recovery_hashes from users where id = $1", [userId]);
  if (!r?.totp_enabled_at || !r.totp_secret) return null;
  if (/^\d{6}$/.test(code)) {
    const secret = decryptSecret(r.totp_secret);
    const step = secret ? verifyTotp(secret, code, Number(r.totp_last_step)) : null;
    if (step == null) return null;
    const ok = await sys("update users set totp_last_step = $2 where id = $1 and totp_last_step < $2 returning id", [userId, step]);
    return ok.length ? "totp" : null;
  }
  if (!allowRecovery || normaliseRecoveryCode(code).length !== 12) return null;
  const h = hashRecoveryCode(code);
  const ok = await sys("update users set totp_recovery_hashes = array_remove(totp_recovery_hashes, $2) where id = $1 and $2 = any(totp_recovery_hashes) returning id", [userId, h]);
  return ok.length ? "recovery" : null;
}

/** Short-lived ticket proving the password step passed. Bound to the password hash, so a password change voids it. */
export function mfaTicket(userId: string, passwordHash: string) {
  return signPayload({ purpose: "mfa-login", uid: userId, pv: sha256(passwordHash).slice(0, 16) }, 5 * 60);
}

export async function readMfaTicket(ticket: string) {
  const t = verifyPayload<{ purpose: string; uid: string; pv: string }>(ticket);
  if (!t || t.purpose !== "mfa-login") throw new HttpError(401, "Your sign-in expired. Please enter your password again.", "mfa_ticket_invalid");
  const [u] = await sys<{ password_hash: string; status: string }>("select password_hash, status from users where id = $1", [t.uid]);
  if (!u || sha256(u.password_hash).slice(0, 16) !== t.pv) throw new HttpError(401, "Your sign-in expired. Please enter your password again.", "mfa_ticket_invalid");
  if (u.status !== "active") throw new HttpError(403, "This account has been deactivated", "deactivated");
  return t.uid;
}
