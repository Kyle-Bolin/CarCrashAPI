import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("GET /healthz", () => {
  it("reports the service is up", async () => {
    const res = await app.request("/healthz");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("unknown routes", () => {
  it("return 404", async () => {
    const res = await app.request("/does-not-exist");

    expect(res.status).toBe(404);
  });
});
