export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./server/env");
  if (!env.databaseUrl) return;
  if (env.autoMigrate) {
    const { migrate } = await import("./server/migrate");
    await migrate(env.databaseUrl);
  }
  // Defence in depth: the application owner role should not be able to bypass Row Level Security.
  const { Client } = await import("pg");
  const c = new Client({ connectionString: env.databaseUrl });
  try {
    await c.connect();
    const { rows } = await c.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
    if (rows[0]?.rolsuper || rows[0]?.rolbypassrls)
      console.warn("[security] DATABASE_URL connects as a role that bypasses Row Level Security (superuser/BYPASSRLS). Tenant requests are still isolated via SET ROLE deceler_app, but use a dedicated non-superuser owner role in production.");
  } catch {
    /* reported by the first request */
  } finally {
    await c.end().catch(() => {});
  }
  // GDPR retention: delete candidate data whose retention period has run out. First run shortly
  // after start (a sleeping free instance wakes up often), then every 6 hours. RETENTION_JOB=off disables it.
  if ((process.env.RETENTION_JOB ?? "on") !== "off") {
    const run = async () => {
      try {
        const { runRetention } = await import("./server/erasure");
        const r = await runRetention();
        if (r.erased) console.log(`[retention] erased ${r.erased} candidate(s) past their retention period`);
      } catch (e) {
        console.error("[retention]", e);
      }
    };
    setTimeout(run, 2 * 60_000).unref();
    setInterval(run, 6 * 60 * 60_000).unref();
  }
}
