/**
 * Writes the OpenAPI document to openapi.json (`pnpm openapi`). CI regenerates it and
 * fails if the committed file differs, so the spec in the repo always matches the code.
 */
import { writeFileSync } from "node:fs";
import { createApp, OPENAPI_CONFIG } from "../src/app.js";

const unused = () => {
  throw new Error("Exporting the spec never queries the database");
};
const app = createApp({
  crashes: { list: unused, get: unused, listByCity: unused },
});
const document = app.getOpenAPI31Document(OPENAPI_CONFIG);
writeFileSync(
  new URL("../openapi.json", import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`,
);
console.log("Wrote openapi.json");
