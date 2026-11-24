#!/usr/bin/env node
/**
 * Restores a Ulysse backup (Admin → Backups) into a NEW, EMPTY database.
 *
 *   1. Create an empty database and run the migrations on it:   DATABASE_URL=… npm run db:migrate
 *   2. Restore:                                                   DATABASE_URL=… npm run restore-backup -- ulysse-backup-2026-11-24.ulyssebak
 *      The backup password is asked for (or set BACKUP_PASSWORD). Files of a backup taken with
 *      STORAGE_DRIVER=fs are written to STORAGE_DIR; with STORAGE_DRIVER=db they are part of the database rows.
 *   3. Point the app (DATABASE_URL, same APP_SECRET as before) at the restored database.
 *
 * The database part is one transaction: if the password is wrong, the file was changed or damaged,
 * or anything fails, nothing is written to the database. The target database must be empty (no users, no companies).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import readline from "node:readline";
import { Writable, pipeline } from "node:stream";
import pg from "pg";

const MAGIC = Buffer.from("ULYBAK01");
const HEADER = MAGIC.length + 1 + 16 + 12;
const TAG = 16;

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function askPassword() {
  if (process.env.BACKUP_PASSWORD) return process.env.BACKUP_PASSWORD;
  const muted = new Writable({ write(_c, _e, cb) { cb(); } });
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
  process.stdout.write("Backup password: ");
  const pw = await new Promise((r) => rl.question("", r));
  rl.close();
  process.stdout.write("\n");
  return pw;
}

const file = process.argv[2];
if (!file) fail("Usage: DATABASE_URL=… npm run restore-backup -- <backup file>");
if (!process.env.DATABASE_URL) fail("Set DATABASE_URL to the NEW, empty database (after running npm run db:migrate on it).");
const stat = fs.statSync(file, { throwIfNoEntry: false });
if (!stat || stat.size < HEADER + TAG) fail("That file doesn't look like a Ulysse backup.");

const fd = fs.openSync(file, "r");
const head = Buffer.alloc(HEADER);
fs.readSync(fd, head, 0, HEADER, 0);
const tag = Buffer.alloc(TAG);
fs.readSync(fd, tag, 0, TAG, stat.size - TAG);
fs.closeSync(fd);
if (!head.subarray(0, MAGIC.length).equals(MAGIC)) fail("That file doesn't look like a Ulysse backup (version 1).");
const logN = head[MAGIC.length];
const salt = head.subarray(MAGIC.length + 1, MAGIC.length + 17);
const iv = head.subarray(MAGIC.length + 17, HEADER);

const password = await askPassword();
const key = crypto.scryptSync(password, salt, 32, { N: 2 ** logN, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = (text, params) => client.query(text, params);

let meta = null;
let end = null;
const counts = {};
const files = [];
let columnsOf = {};

async function handle(line) {
  if (!line) return;
  const m = JSON.parse(line);
  if (m.type === "meta") {
    if (m.app !== "ulysse" || m.version !== 1) throw new Error("Unsupported backup version.");
    meta = m;
    const have = new Set((await q("select name from schema_migrations")).rows.map((r) => r.name));
    const missing = m.migrations.filter((x) => !have.has(x));
    if (missing.length) throw new Error(`Run the migrations on the new database first (npm run db:migrate). Missing: ${missing.join(", ")}`);
    const [{ users, orgs }] = (await q("select (select count(*)::int from users) users, (select count(*)::int from organizations) orgs")).rows;
    if (users || orgs) throw new Error("The target database isn't empty. Restore only into a new database.");
    console.log(`Backup from ${m.createdAt} (${m.tables.length} tables). Restoring…`);
  } else if (m.type === "rows") {
    if (!meta) throw new Error("Damaged backup (no header).");
    if (!m.rows.length) return;
    // Explicit column list: columns added by newer migrations keep their defaults.
    if (!columnsOf[m.table]) {
      // The migrations seed some defaults (feature flags, platform settings): the backup's own rows replace them.
      await q(`delete from "${m.table.replace(/"/g, '""')}"`);
    }
    const cols = columnsOf[m.table] ??= Object.keys(m.rows[0]);
    const list = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
    const t = `"${m.table.replace(/"/g, '""')}"`;
    await q(`insert into ${t} (${list}) select ${list} from json_populate_recordset(null::${t}, $1::json)`, [JSON.stringify(m.rows)]);
    counts[m.table] = (counts[m.table] ?? 0) + m.rows.length;
    process.stdout.write(`\r  ${m.table}: ${counts[m.table]}            `);
  } else if (m.type === "file") {
    // Files of a backup taken with STORAGE_DRIVER=fs go to STORAGE_DIR as they arrive.
    const dir = process.env.STORAGE_DIR;
    if (!dir) throw new Error("This backup contains files: set STORAGE_DIR to the (empty) folder the app will use.");
    const target = path.resolve(dir, m.key);
    if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error(`Unsafe file name in backup: ${m.key}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(m.data, "base64"));
    files.push(m.key);
  } else if (m.type === "end") {
    end = m;
  }
}

try {
  await q("begin");
  await q("select set_config('app.bypass', 'on', true)");
  // Decrypt and gunzip as a stream (the ciphertext sits between the header and the tag).
  const gunzip = zlib.createGunzip();
  const cipherStream = fs.createReadStream(file, { start: HEADER, end: stat.size - TAG - 1 });
  pipeline(cipherStream, decipher, gunzip, () => {});
  let pending = "";
  try {
    for await (const chunk of gunzip) {
      pending += chunk.toString("utf8");
      let i;
      while ((i = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, i);
        pending = pending.slice(i + 1);
        await handle(line);
      }
    }
    await handle(pending);
  } catch (e) {
    if (/unable to authenticate|incorrect header|unsupported state/i.test(String(e?.message))) throw new Error("Wrong backup password, or the file was changed or damaged.");
    throw e;
  }
  if (!meta || !end) throw new Error("The backup is incomplete (it may have been cut off while downloading).");
  for (const [t, n] of Object.entries(end.counts)) if ((counts[t] ?? 0) !== n) throw new Error(`Table ${t}: expected ${n} rows, restored ${counts[t] ?? 0}.`);
  // Serial/identity columns continue after the restored ids.
  const seqs = (await q(`select table_name, column_name from information_schema.columns where table_schema = 'public' and (column_default like 'nextval(%' or is_identity = 'YES')`)).rows;
  for (const s of seqs) await q(`select setval(pg_get_serial_sequence($1, $2), greatest(coalesce((select max("${s.column_name}") from "${s.table_name}"), 0), 1))`, [`public."${s.table_name}"`, s.column_name]);
  await q("commit");
  process.stdout.write("\n");
  console.log(`✓ Restored ${Object.values(counts).reduce((a, b) => a + b, 0)} rows in ${Object.keys(counts).length} tables${files.length ? ` and ${files.length} files` : ""}.`);
  console.log("  Start the app with this DATABASE_URL and the same APP_SECRET as before. Everyone signs in again.");
} catch (e) {
  await q("rollback").catch(() => {});
  await client.end();
  fail(`${e.message}\n  Nothing was written to the database.${files.length ? " Files already copied to STORAGE_DIR can be deleted." : ""}`);
}
await client.end();
