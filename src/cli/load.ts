import pg from "pg";
import { loadConfig } from "../config.js";
import { parseLoadArgs } from "../loader/args.js";
import { loadCrashes } from "../loader/load.js";

try {
  const options = parseLoadArgs(process.argv.slice(2));
  const { DATABASE_URL } = loadConfig();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const started = Date.now();
    const result = await loadCrashes(client, options);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `Loaded ${options.file} in ${seconds}s: ${result.read} rows read, ` +
        `${result.upserted} inserted or updated, ${result.skipped} skipped.`,
    );
    if (result.withoutTimezone > 0) {
      console.log(
        `${result.withoutTimezone} loaded rows have no time zone, so their times are NULL.`,
      );
    }
  } finally {
    await client.end();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
