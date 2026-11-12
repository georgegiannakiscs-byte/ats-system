import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Applies db/migrations/*.sql in order, once each. Safe to run on every start.
 * Each migration runs in its own transaction under a transaction-level advisory lock, so it also
 * works through a transaction-mode connection pooler (e.g. Neon's pooled connection string).
 */
export async function migrate(databaseUrl: string, log = console.log) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const LOCK = 727272;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK]);
    await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    await client.query("commit");
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      await client.query("begin");
      try {
        await client.query("select pg_advisory_xact_lock($1)", [LOCK]);
        if ((await client.query("select 1 from schema_migrations where name = $1", [f])).rowCount) {
          await client.query("commit");
          continue;
        }
        await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
        await client.query("insert into schema_migrations(name) values ($1)", [f]);
        await client.query("commit");
        log(`[db] applied ${f}`);
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}
