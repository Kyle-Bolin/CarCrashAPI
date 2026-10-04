import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

/**
 * A connection pool wrapped in Drizzle. On Lambda, pass `max: 1`: each instance serves
 * one request at a time, and ADR-002 caps connections through reserved concurrency.
 */
export function createDatabase(
  databaseUrl: string,
  { max = 10 }: { max?: number } = {},
): { db: NodePgDatabase; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max });
  // An idle client losing its connection must not crash the process; the pool replaces it.
  pool.on("error", (error) =>
    console.error("Database pool error:", error.message),
  );
  return { db: drizzle(pool), pool };
}

/** Opens one connection and runs `SELECT 1`, so a bad URL or a stopped database fails at startup. */
export async function checkDatabase(
  databaseUrl: string,
  timeoutMs = 5000,
): Promise<void> {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: timeoutMs,
  });
  // Without a listener, an error after connect would crash with an unhelpful stack.
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    try {
      await client.end();
    } catch {
      // The original failure is the one worth reporting.
    }
  }
}
