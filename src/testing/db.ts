import { fileURLToPath } from "node:url";
import pg from "pg";
import { describe } from "vitest";
import { loadCrashes } from "../loader/load.js";

/**
 * A migrated database the tests may write to. CI's "Tests" job sets it; locally, point
 * it at the Compose database after `pnpm db:migrate`. Without it, database tests skip.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const describeWithDatabase = describe.skipIf(!TEST_DATABASE_URL);

export const FIXTURE = fileURLToPath(
  new URL("../../fixtures/crashes.csv", import.meta.url),
);

/** Runs `fn` with a connected client and always closes it. */
export async function withClient<T>(
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Loads the committed fixture. Safe to repeat: the loader upserts by ID. */
export function seedFixture() {
  return withClient((client) => loadCrashes(client, { file: FIXTURE }));
}
