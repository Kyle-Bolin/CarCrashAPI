import { handle } from "hono/aws-lambda";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createCrashStore } from "./crashes/store.js";
import { createDatabase } from "./db.js";

// Runs once per Lambda instance. One connection per instance (see ADR-002).
const { db } = createDatabase(loadConfig().DATABASE_URL, { max: 1 });

export const handler = handle(createApp({ crashes: createCrashStore(db) }));
