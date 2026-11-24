import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env, assertEnv } from "./env";

declare global {
  var __decelerPool: Pool | undefined;
}

function pool() {
  if (!globalThis.__decelerPool) {
    assertEnv();
    globalThis.__decelerPool = new Pool({ connectionString: env.databaseUrl, max: 10 });
  }
  return globalThis.__decelerPool;
}

export type Q = <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;

const wrap = (c: Pool | PoolClient): Q => async (text, params) => (await c.query(text, params as unknown[])).rows;

/**
 * System context - runs as the schema owner. Use ONLY for: authentication,
 * public careers reads (published jobs), public application intake, membership
 * checks and platform-admin aggregates. Never for authenticated tenant reads.
 */
export const sys: Q = (text, params) => sysTx((q) => q(text, params));

export async function sysTx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.bypass', 'on', true)");
    const r = await fn(wrap(client));
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Tenant context - switches to the restricted `deceler_app` role and pins the
 * organisation and user for this transaction. Row Level Security then limits
 * every statement to rows of that organisation, for active members only.
 */
export async function tenantTx<T>(orgId: string, userId: string, fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("set local role deceler_app");
    await client.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [orgId, userId]);
    const r = await fn(wrap(client));
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * A read-only, consistent snapshot of the whole database in the system context (backups only).
 * Every statement sees the same moment in time. The caller MUST call done() (also on errors).
 */
export async function openSnapshot() {
  const client = await pool().connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    await client.query("select set_config('app.bypass', 'on', true)");
  } catch (e) {
    client.release();
    throw e;
  }
  let open = true;
  return {
    q: wrap(client),
    done: async () => {
      if (!open) return;
      open = false;
      await client.query("rollback").catch(() => {});
      client.release();
    },
  };
}
