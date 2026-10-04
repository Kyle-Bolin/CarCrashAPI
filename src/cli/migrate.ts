import { loadConfig } from "../config.js";
import { runMigrations } from "../migrate.js";

try {
  const { DATABASE_URL } = loadConfig();
  await runMigrations(DATABASE_URL);
  console.log("Migrations are up to date");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
