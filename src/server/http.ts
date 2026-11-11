import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { env } from "./env";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

export const json = (data: unknown, init?: number | ResponseInit) => NextResponse.json(data, typeof init === "number" ? { status: init } : init);

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

/** CSRF defence for cookie-authenticated mutations: same-origin requests only. */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (tests, curl) don't send Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    const u = new URL(origin);
    ok = u.host === host || origin === env.appUrl;
  } catch {}
  if (!ok) throw new HttpError(403, "Cross-origin request blocked", "csrf");
}

/** Wraps a route handler with uniform error handling. */
export function handler<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A) => {
    try {
      assertSameOrigin(req);
      return await fn(req, ...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code, details: e.details }, e.status);
      if (e instanceof ZodError) return json({ error: "Invalid input", code: "validation", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
      const pgCode = (e as { code?: string }).code;
      if (pgCode === "23505") return json({ error: "Already exists", code: "conflict" }, 409);
      if (pgCode === "42501") return json({ error: "Not permitted", code: "rls" }, 403);
      console.error("[api]", e);
      return json({ error: "Something went wrong", code: "internal" }, 500);
    }
  };
}
