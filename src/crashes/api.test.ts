import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createDatabase } from "../db.js";
import { PROBLEM_CONTENT_TYPE } from "../problem.js";
import {
  describeWithDatabase,
  seedFixture,
  TEST_DATABASE_URL,
  withClient,
} from "../testing/db.js";
import { type Crash, CrashListSchema, CrashSchema } from "./model.js";
import { createCrashStore } from "./store.js";

// End-to-end through the HTTP layer, the store and Postgres, against the fixture.
describeWithDatabase("v1 API against the fixture", () => {
  const { db, pool } = createDatabase(TEST_DATABASE_URL as string);
  const app = createApp({ crashes: createCrashStore(db) });

  beforeAll(async () => {
    await seedFixture();
  });
  afterAll(() => pool.end());

  async function list(path: string): Promise<Crash[]> {
    const res = await app.request(path);
    expect(res.status).toBe(200);
    // Every response must match the documented schema.
    return CrashListSchema.parse(await res.json()).data;
  }

  const ids = (sql: string, params: unknown[] = []) =>
    withClient(async (client) =>
      (await client.query<{ id: string }>(sql, params)).rows.map((r) => r.id),
    );

  describe("GET /v1/crashes", () => {
    it("returns the newest 100 crashes by default", async () => {
      const crashes = await list("/v1/crashes");

      expect(crashes.map((c) => c.id)).toEqual(
        await ids(
          "SELECT id FROM crashes ORDER BY start_time DESC NULLS LAST, id LIMIT 100",
        ),
      );
    });

    it("puts crashes with no start time last", async () => {
      const crashes = await list("/v1/crashes?limit=1000");
      const firstNull = crashes.findIndex((c) => c.startTime === null);

      expect(firstNull).toBeGreaterThan(0);
      expect(crashes.slice(firstNull).every((c) => c.startTime === null)).toBe(
        true,
      );
    });

    it("honors the limit", async () => {
      expect(await list("/v1/crashes?limit=3")).toHaveLength(3);
    });
  });

  describe("GET /v1/crashes/{id}", () => {
    it("returns the crash with camelCase keys, UTC times and nulls for gaps", async () => {
      const res = await app.request("/v1/crashes/SYN-1");
      expect(res.status).toBe(200);
      const crash = CrashSchema.parse(await res.json());

      // fixtures/crashes.csv: 2018-03-26 16:57 US/Pacific, during daylight saving time.
      expect(crash).toMatchObject({
        id: "SYN-1",
        source: "Source2",
        severity: 1,
        startTime: "2018-03-26T23:57:00.000Z",
        endTime: "2018-03-27T03:38:00.000Z",
        weatherTimestamp: "2018-03-26T23:53:00.000Z",
        city: "Sacramento",
        state: "CA",
        timezone: "America/Los_Angeles",
        temperature: 61.7,
        windChill: null,
        endLat: null,
        precipitation: null,
        trafficSignal: false,
        sunriseSunset: "Day",
      });
      for (const key of Object.keys(crash)) {
        expect(key).toMatch(/^[a-z][a-zA-Z]*$/);
      }
    });

    it("returns NULL times for a crash with no time zone", async () => {
      const res = await app.request("/v1/crashes/SYN-97");
      const crash = CrashSchema.parse(await res.json());

      expect(crash).toMatchObject({
        startTime: null,
        endTime: null,
        timezone: null,
        state: "WA",
      });
    });

    it("returns a 404 problem for an unknown ID", async () => {
      const res = await app.request("/v1/crashes/A-0");

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain(PROBLEM_CONTENT_TYPE);
    });
  });

  describe("GET /v1/states/{state}/cities/{city}/crashes", () => {
    it("matches the city case-insensitively within the state", async () => {
      const crashes = await list(
        "/v1/states/oh/cities/COLUMBUS/crashes?limit=1000",
      );

      expect(crashes.length).toBeGreaterThan(0);
      expect(crashes.map((c) => c.id)).toEqual(
        await ids(
          `SELECT id FROM crashes WHERE state = 'OH' AND city = 'Columbus'
           ORDER BY start_time DESC NULLS LAST, id`,
        ),
      );
    });

    it("keeps same-named cities in different states apart", async () => {
      const ohio = await list(
        "/v1/states/OH/cities/Columbus/crashes?limit=1000",
      );
      const georgia = await list(
        "/v1/states/GA/cities/Columbus/crashes?limit=1000",
      );

      expect(new Set(ohio.map((c) => c.state))).toEqual(new Set(["OH"]));
      expect(new Set(georgia.map((c) => c.state))).toEqual(new Set(["GA"]));
    });

    it("decodes city names with spaces and honors the limit", async () => {
      const crashes = await list(
        "/v1/states/NY/cities/new%20york/crashes?limit=2",
      );

      expect(crashes).toHaveLength(2);
      expect(crashes.every((c) => c.city === "New York")).toBe(true);
    });

    it("returns an empty list for a city with no crashes", async () => {
      expect(await list("/v1/states/OH/cities/Nowhere/crashes")).toEqual([]);
    });

    it("rejects an invalid state with a 400 problem", async () => {
      const res = await app.request("/v1/states/Ohio/cities/Columbus/crashes");

      expect(res.status).toBe(400);
    });
  });
});

describe("v1 API with the database down", () => {
  it("answers with a 500 problem, never an empty 200", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Nothing listens on port 1, so every query fails to connect.
    const { db, pool } = createDatabase("postgres://u:p@127.0.0.1:1/none");
    const app = createApp({ crashes: createCrashStore(db) });
    try {
      const res = await app.request("/v1/crashes");

      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toContain(PROBLEM_CONTENT_TYPE);
    } finally {
      await pool.end();
      vi.restoreAllMocks();
    }
  });
});
