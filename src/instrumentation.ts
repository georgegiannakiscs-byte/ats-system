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
}
