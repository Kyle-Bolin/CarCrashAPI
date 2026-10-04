import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** `drizzle/` at the repository root, or `/app/drizzle` in the Docker image. */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

/**
 * Applies pending migrations from `drizzle/`. Uses the same bookkeeping table as
 * drizzle-kit, so it runs anywhere the app does: locally, in Docker, or in a Lambda.
 */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
