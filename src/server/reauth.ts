import "server-only";
import { sys } from "./db";
import { HttpError } from "./http";
import { rateLimit, verifyPassword } from "./security";

/** Sensitive account changes ask for the current password again (and are rate limited per user). */
export async function confirmPassword(userId: string, password: string) {
  if (!rateLimit(`reauth:${userId}`, 10, 15 * 60_000).ok) throw new HttpError(429, "Too many attempts. Please wait a few minutes.", "rate_limited");
  const [u] = await sys<{ password_hash: string }>("select password_hash from users where id = $1", [userId]);
  if (!u || !(await verifyPassword(password, u.password_hash))) throw new HttpError(400, "Your current password is incorrect", "wrong_password");
  return u.password_hash;
}
