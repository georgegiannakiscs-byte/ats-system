import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { env } from "./env";
import { sys } from "./db";

/**
 * Private object storage. Files are only served through authorised route handlers with signed URLs.
 * - "fs" (default): files on disk under STORAGE_DIR, outside the public web root.
 * - "db": files in the stored_objects table (system context only). For hosts without a
 *   persistent disk, such as a free Render web service with a Neon database.
 * Swap for S3 / Supabase Storage by implementing the same three functions.
 */
function checkKey(key: string) {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key;
}
const resolve = (key: string) => path.join(env.storageDir, checkKey(key));

export async function putObject(key: string, data: Buffer) {
  if (env.storageDriver === "db") {
    await sys("insert into stored_objects (key, data, size_bytes) values ($1, $2, $3) on conflict (key) do update set data = excluded.data, size_bytes = excluded.size_bytes, created_at = now()", [checkKey(key), data, data.length]);
    return;
  }
  const p = resolve(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data, { mode: 0o600 });
}

export async function getObject(key: string): Promise<Buffer> {
  if (env.storageDriver === "db") {
    const [row] = await sys<{ data: Buffer }>("select data from stored_objects where key = $1", [checkKey(key)]);
    if (!row) throw Object.assign(new Error(`Object not found: ${key}`), { code: "ENOENT" });
    return row.data;
  }
  return fs.readFile(resolve(key));
}

export async function deleteObject(key: string) {
  if (env.storageDriver === "db") {
    await sys("delete from stored_objects where key = $1", [checkKey(key)]);
    return;
  }
  await fs.rm(resolve(key), { force: true });
}

/** Prefixes under which a company's files are stored (CVs, CV Builder drafts and photos, logos). */
export const orgFilePrefixes = (orgId: string) => ["cv", "cv-drafts", "cv-photos", "logos"].map((p) => `${p}/${checkKey(orgId)}/`);

/**
 * Deletes every stored file of a company. With the database driver this runs inside the caller's
 * transaction (q), so files and rows disappear together; on disk it runs after the commit.
 */
export async function deleteOrgFiles(orgId: string, q?: (text: string, params?: unknown[]) => Promise<unknown>) {
  const prefixes = orgFilePrefixes(orgId);
  if (env.storageDriver === "db") {
    const run = q ?? sys;
    await run("delete from stored_objects where key like any($1)", [prefixes.map((p) => `${p}%`)]);
    return;
  }
  for (const p of prefixes) await fs.rm(resolve(p.slice(0, -1)), { recursive: true, force: true });
}

/** Malware scan via ClamAV (clamd INSTREAM) when CLAMAV_HOST is configured. */
export async function scanBuffer(data: Buffer): Promise<"clean" | "infected" | "not_scanned" | "error"> {
  if (!env.clamavHost) return "not_scanned";
  return new Promise((resolveScan) => {
    const sock = net.createConnection({ host: env.clamavHost, port: env.clamavPort });
    let reply = "";
    sock.setTimeout(15000, () => (sock.destroy(), resolveScan("error")));
    sock.on("error", () => resolveScan("error"));
    sock.on("data", (d) => (reply += d.toString()));
    sock.on("end", () => resolveScan(reply.includes("FOUND") ? "infected" : reply.includes("OK") ? "clean" : "error"));
    sock.write("zINSTREAM\0");
    for (let i = 0; i < data.length; i += 64 * 1024) {
      const chunk = data.subarray(i, i + 64 * 1024);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(chunk.length);
      sock.write(len);
      sock.write(chunk);
    }
    sock.end(Buffer.alloc(4));
  });
}

/** Verifies real file type from content, not the client-supplied name/MIME. */
export function sniffCv(buf: Buffer): { ext: "pdf" | "docx"; mime: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", mime: "application/pdf" };
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf.includes(Buffer.from("word/document.xml"))) return { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  return null;
}

export function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { ext: "webp", mime: "image/webp" };
  const head = buf.subarray(0, 512).toString("utf8").trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return { ext: "svg", mime: "image/svg+xml" };
  return null;
}

/** Strict SVG allow-check: rejects scripts, event handlers, foreign content and external references. */
export function svgIsSafe(svg: string) {
  const s = svg.toLowerCase();
  const banned = ["<script", "javascript:", "<foreignobject", "<iframe", "<embed", "<object", "<!entity", "<!doctype", "data:text/html", "<use", "@import"];
  if (banned.some((b) => s.includes(b))) return false;
  if (/\son[a-z]+\s*=/.test(s)) return false;
  if (/(xlink:)?href\s*=\s*["']\s*(https?:|\/\/)/.test(s)) return false;
  return true;
}
