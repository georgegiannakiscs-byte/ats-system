import "server-only";
import { cookies } from "next/headers";
import { sys } from "./db";
import { env } from "./env";
import { HttpError } from "./http";
import { randomToken, sha256 } from "./security";

export const SESSION_COOKIE = "deceler_session";
const SESSION_DAYS = 14;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  preferredLanguage: "en" | "el";
}

export async function createSession(userId: string, req?: Request) {
  const token = randomToken();
  await sys("insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)", [
    userId, sha256(token), String(SESSION_DAYS), req?.headers.get("x-forwarded-for") ?? null, req?.headers.get("user-agent")?.slice(0, 200) ?? null,
  ]);
  await sys("update users set last_login_at = now() where id = $1", [userId]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sys("update sessions set revoked_at = now() where token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await sys<{ id: string; email: string; name: string; is_platform_admin: boolean; preferred_language: "en" | "el" }>(
    `select u.id, u.email, u.name, u.is_platform_admin, u.preferred_language from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.status = 'active'`,
    [sha256(token)],
  );
  const u = rows[0];
  return u ? { id: u.id, email: u.email, name: u.name, isPlatformAdmin: u.is_platform_admin, preferredLanguage: u.preferred_language } : null;
}

export async function requireUser() {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Please sign in", "unauthenticated");
  return u;
}

export async function requirePlatformAdmin() {
  const u = await requireUser();
  if (!u.isPlatformAdmin) throw new HttpError(403, "Platform administrator access required", "forbidden");
  return u;
}
