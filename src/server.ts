import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { prepare } from "./startup.js";

let config: Awaited<ReturnType<typeof prepare>>;
try {
  config = await prepare();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
