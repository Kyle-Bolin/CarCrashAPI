import { type Config, loadConfig } from "./config.js";
import { checkDatabase } from "./db.js";

/** Validates config and database reachability; throws with a readable message on failure. */
export async function prepare(
  env: NodeJS.ProcessEnv = process.env,
  check: (databaseUrl: string) => Promise<void> = checkDatabase,
): Promise<Config> {
  const config = loadConfig(env);
  try {
    await check(config.DATABASE_URL);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message || error.name : String(error);
    throw new Error(`Cannot reach the database: ${reason}`);
  }
  return config;
}
