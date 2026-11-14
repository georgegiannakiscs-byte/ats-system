import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Centralised, validated server configuration. Never import from client code. */
const isProd = process.env.NODE_ENV === "production";

function devSecret() {
  // Development convenience only: a random secret persisted under .data/.
  const file = path.join(process.cwd(), ".data", "dev-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  }
}

export const env = {
  isProd,
  databaseUrl: process.env.DATABASE_URL ?? (isProd ? "" : "postgres://deceler:deceler_dev@localhost:5432/deceler"),
  appSecret: process.env.APP_SECRET ?? (isProd ? "" : devSecret()),
  // RENDER_EXTERNAL_URL is set automatically on Render, so the free test deployment needs no APP_URL.
  appUrl: (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** "fs" (files under STORAGE_DIR, default) or "db" (files in PostgreSQL, for hosts without a disk). */
  storageDriver: process.env.STORAGE_DRIVER === "db" ? ("db" as const) : ("fs" as const),
  storageDir: process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data", "storage"),
  platformAdminEmails: (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  bootstrapFirstAdmin: (process.env.BOOTSTRAP_FIRST_USER_AS_ADMIN ?? (isProd ? "false" : "true")) === "true",
  smtpUrl: process.env.SMTP_URL ?? "",
  mailFrom: process.env.MAIL_FROM ?? "",
  clamavHost: process.env.CLAMAV_HOST ?? "",
  clamavPort: Number(process.env.CLAMAV_PORT ?? 3310),
  autoMigrate: (process.env.AUTO_MIGRATE ?? "true") === "true",
  /** Public application submissions allowed per IP per hour. */
  applyRateLimit: Number(process.env.RATE_LIMIT_APPLY_PER_HOUR ?? 20),
  /**
   * Additional exact origins (comma-separated, e.g. "https://a.example,http://localhost:3000")
   * accepted by the same-origin check. Only for setups behind a tunnel that rewrites the Origin
   * header (the Codespaces demo). Unset in normal deployments.
   */
  /** See clientIp() in http.ts. */
  clientIpHeader: (process.env.CLIENT_IP_HEADER ?? "").trim().toLowerCase(),
  trustedProxyHops: Math.max(0, Math.min(5, Number(process.env.TRUSTED_PROXY_HOPS ?? 0) || 0)),
  extraAllowedOrigins: (process.env.EXTRA_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean),
};

export function assertEnv() {
  const missing = [];
  if (!env.databaseUrl) missing.push("DATABASE_URL");
  if (!env.appSecret || env.appSecret.length < 32) missing.push("APP_SECRET (32+ chars)");
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(", ")}`);
}
