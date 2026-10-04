import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createCrashStore } from "./crashes/store.js";
import { createDatabase } from "./db.js";
import { prepare } from "./startup.js";

let config: Awaited<ReturnType<typeof prepare>>;
try {
  config = await prepare();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { db } = createDatabase(config.DATABASE_URL);
const app = createApp({ crashes: createCrashStore(db) });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`Listening on http://localhost:${info.port} (docs at /docs)`);
});
