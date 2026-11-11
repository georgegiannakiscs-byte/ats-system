import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

/** Applies db/migrations/*.sql in order, once each. Safe to run on every start. */
export async function migrate(databaseUrl: string, log = console.log) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock(727272)");
    await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sqlText = fs.readFileSync(path.join(dir, f), "utf8");
      await client.query("begin");
      try {
        await client.query(sqlText);
        await client.query("insert into schema_migrations(name) values ($1)", [f]);
        await client.query("commit");
        log(`[db] applied ${f}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(727272)").catch(() => {});
    await client.end();
  }
}
