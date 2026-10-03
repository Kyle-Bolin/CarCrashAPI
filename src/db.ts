import pg from "pg";

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
