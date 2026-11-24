import "server-only";
import crypto from "node:crypto";
import zlib from "node:zlib";
import path from "node:path";
import { promises as fs } from "node:fs";
import { Readable, pipeline } from "node:stream";
import { promisify } from "node:util";
import { openSnapshot, sys } from "./db";
import { env } from "./env";

/**
 * Full, encrypted platform backup (Admin → Backups). Restored with `npm run restore-backup`.
 *
 * File format, version 1 (".ulyssebak"):
 *   "ULYBAK01" (8 bytes) | log2(scrypt N) (1 byte) | salt (16) | IV (12) | AES-256-GCM ciphertext | GCM tag (16)
 * The key is scrypt(password, salt, N, r=8, p=1). The plaintext is gzip-compressed NDJSON:
 *   {"type":"meta", version, createdAt, migrations, storageDriver, tables}
 *   {"type":"rows", "table": "...", "rows": [ {...}, ... ]}       tables in foreign-key order
 *   {"type":"file", "key": "cv/<org>/<id>.pdf", "data": "<base64>"} only with STORAGE_DRIVER=fs
 *   {"type":"end", counts, files}
 * Login sessions and password-reset links are left out (they are useless after a restore).
 */
export const BACKUP_MAGIC = Buffer.from("ULYBAK01");
export const BACKUP_MIN_PASSWORD = 12;
const SCRYPT_LOG_N = 15;
const SKIP = new Set(["sessions", "password_resets", "schema_migrations"]);

const ident = (t: string) => `"${t.replace(/"/g, '""')}"`;

/** Tables ordered so that every table comes after the tables it references (restore inserts in this order). */
async function orderedTables(q: Awaited<ReturnType<typeof openSnapshot>>["q"]) {
  const tables = (await q<{ t: string }>("select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")).map((r) => r.t).filter((t) => !SKIP.has(t));
  const deps = await q<{ child: string; parent: string }>(
    `select c.relname as child, p.relname as parent from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
     where k.contype = 'f' and k.connamespace = 'public'::regnamespace and c.oid <> p.oid`,
  );
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, stack: Set<string>) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const d of deps) if (d.child === t && tables.includes(d.parent)) visit(d.parent, stack);
    stack.delete(t);
    seen.add(t);
    out.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return out;
}

async function* walk(dir: string, base = dir): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, base);
    else if (e.isFile()) yield path.relative(base, full).split(path.sep).join("/");
  }
}

/** The plaintext NDJSON, streamed from one consistent snapshot (small batches, one stored file at a time). */
async function* backupLines(): AsyncGenerator<string> {
  const s = await openSnapshot();
  try {
    const tables = await orderedTables(s.q);
    const migrations = (await s.q<{ name: string }>("select name from schema_migrations order by name")).map((r) => r.name);
    yield JSON.stringify({ type: "meta", version: 1, app: "ulysse", createdAt: new Date().toISOString(), migrations, storageDriver: env.storageDriver, tables }) + "\n";
    const counts: Record<string, number> = {};
    for (const t of tables) {
      // Stored files (CVs, logos) can be several MB each: one row per batch keeps memory low.
      const batch = t === "stored_objects" ? 1 : 500;
      await s.q(`declare bk no scroll cursor for select row_to_json(x)::text as r from ${ident(t)} x`);
      let n = 0;
      for (;;) {
        const rows = await s.q<{ r: string }>(`fetch ${batch} from bk`);
        if (!rows.length) break;
        n += rows.length;
        yield `{"type":"rows","table":${JSON.stringify(t)},"rows":[${rows.map((r) => r.r).join(",")}]}\n`;
      }
      await s.q("close bk");
      counts[t] = n;
    }
    let files = 0;
    if (env.storageDriver === "fs") {
      for await (const key of walk(env.storageDir)) {
        const data = await fs.readFile(path.join(env.storageDir, key)).catch(() => null);
        if (!data) continue;
        files++;
        yield JSON.stringify({ type: "file", key, data: data.toString("base64") }) + "\n";
      }
    }
    yield JSON.stringify({ type: "end", counts, files }) + "\n";
  } finally {
    await s.done();
  }
}

/** The encrypted backup as a stream. Stops (and frees the database connection) if the download is cancelled. */
export async function encryptedBackup(password: string): Promise<Readable> {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await promisify<crypto.BinaryLike, crypto.BinaryLike, number, crypto.ScryptOptions, Buffer>(crypto.scrypt)(password, salt, 32, { N: 2 ** SCRYPT_LOG_N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const source = Readable.from(backupLines());
  pipeline(source, zlib.createGzip({ level: 6 }), cipher, () => {});
  async function* out() {
    yield Buffer.concat([BACKUP_MAGIC, Buffer.from([SCRYPT_LOG_N]), salt, iv]);
    try {
      for await (const chunk of cipher) yield chunk as Buffer;
      yield cipher.getAuthTag();
    } finally {
      if (!source.destroyed) source.destroy();
    }
  }
  return Readable.from(out());
}

export async function lastBackup() {
  const [r] = await sys<{ value: { lastAt?: string; by?: string } }>("select value from platform_settings where key = 'backup'");
  return { lastAt: r?.value.lastAt ?? null, by: r?.value.by ?? null };
}

export async function recordBackup(email: string) {
  await sys(
    "insert into platform_settings (key, value) values ('backup', $1::jsonb) on conflict (key) do update set value = excluded.value",
    [JSON.stringify({ lastAt: new Date().toISOString(), by: email })],
  );
}
