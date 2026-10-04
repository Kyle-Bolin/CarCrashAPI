import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, DEFAULT_LIMIT, MAX_LIMIT } from "./app.js";
import { type Crash, CrashSchema } from "./crashes/model.js";
import type { CrashStore } from "./crashes/store.js";
import { PROBLEM_CONTENT_TYPE } from "./problem.js";

// A crash with every optional field missing.
const crash: Crash = CrashSchema.parse({
  ...Object.fromEntries(
    Object.keys(CrashSchema.shape).map((key) => [key, null]),
  ),
  id: "A-0",
});

function stubStore(overrides: Partial<CrashStore> = {}): CrashStore {
  return {
    list: vi.fn(async () => [{ ...crash, id: "A-1" }]),
    get: vi.fn(async (id: string) =>
      id === "A-1" ? { ...crash, id } : undefined,
    ),
    listByCity: vi.fn(async () => []),
    ...overrides,
  };
}

async function problemOf(res: Response) {
  expect(res.headers.get("content-type")).toContain(PROBLEM_CONTENT_TYPE);
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /healthz", () => {
  it("reports the service is up", async () => {
    const res = await createApp({ crashes: stubStore() }).request("/healthz");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /v1/crashes", () => {
  it(`returns { data } and defaults the limit to ${DEFAULT_LIMIT}`, async () => {
    const crashes = stubStore();
    const res = await createApp({ crashes }).request("/v1/crashes");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ ...crash, id: "A-1" }] });
    expect(crashes.list).toHaveBeenCalledWith(DEFAULT_LIMIT);
  });

  it("passes a valid limit through", async () => {
    const crashes = stubStore();
    await createApp({ crashes }).request(`/v1/crashes?limit=${MAX_LIMIT}`);

    expect(crashes.list).toHaveBeenCalledWith(MAX_LIMIT);
  });

  it.each(["0", "-1", `${MAX_LIMIT + 1}`, "abc", "2.5"])(
    "rejects limit=%s with a 400 problem",
    async (limit) => {
      const crashes = stubStore();
      const res = await createApp({ crashes }).request(
        `/v1/crashes?limit=${limit}`,
      );

      expect(res.status).toBe(400);
      const body = await problemOf(res);
      expect(body).toMatchObject({
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        instance: "/v1/crashes",
        errors: [expect.objectContaining({ in: "query", name: "limit" })],
      });
      expect(crashes.list).not.toHaveBeenCalled();
    },
  );
});

describe("GET /v1/crashes/{id}", () => {
  it("returns one crash object, not an array", async () => {
    const res = await createApp({ crashes: stubStore() }).request(
      "/v1/crashes/A-1",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...crash, id: "A-1" });
  });

  it("returns a 404 problem for an unknown ID", async () => {
    const res = await createApp({ crashes: stubStore() }).request(
      "/v1/crashes/A-404",
    );

    expect(res.status).toBe(404);
    expect(await problemOf(res)).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "No crash has the ID A-404.",
      instance: "/v1/crashes/A-404",
    });
  });

  it("rejects an ID longer than 64 characters", async () => {
    const res = await createApp({ crashes: stubStore() }).request(
      `/v1/crashes/${"x".repeat(65)}`,
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /v1/states/{state}/cities/{city}/crashes", () => {
  it("passes the decoded city and the state through", async () => {
    const crashes = stubStore();
    const res = await createApp({ crashes }).request(
      "/v1/states/ny/cities/New%20York/crashes?limit=5",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
    expect(crashes.listByCity).toHaveBeenCalledWith("ny", "New York", 5);
  });

  it.each(["Ohio", "O", "1A"])(
    "rejects state %s with a 400 problem",
    async (state) => {
      const res = await createApp({ crashes: stubStore() }).request(
        `/v1/states/${state}/cities/Columbus/crashes`,
      );

      expect(res.status).toBe(400);
      expect(await problemOf(res)).toMatchObject({
        errors: [expect.objectContaining({ in: "param", name: "state" })],
      });
    },
  );
});

describe("errors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("turns a failing query into a 500 problem, never an empty 200", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const crashes = stubStore({
      list: async () => {
        throw new Error("connection terminated: secret detail");
      },
    });
    const res = await createApp({ crashes }).request("/v1/crashes");

    expect(res.status).toBe(500);
    const body = await problemOf(res);
    expect(body).toMatchObject({ status: 500, title: "Internal Server Error" });
    expect(JSON.stringify(body)).not.toContain("secret detail");
    expect(log).toHaveBeenCalled();
  });

  it("returns a 404 problem for unknown routes", async () => {
    const res = await createApp({ crashes: stubStore() }).request("/v2/nope");

    expect(res.status).toBe(404);
    expect(await problemOf(res)).toMatchObject({
      detail: "No route matches GET /v2/nope.",
    });
  });

  it("keeps the status of client errors raised as HTTPException", async () => {
    const { HTTPException } = await import("hono/http-exception");
    const crashes = stubStore({
      get: async () => {
        throw new HTTPException(404, { message: "gone" });
      },
    });
    const res = await createApp({ crashes }).request("/v1/crashes/A-1");

    expect(res.status).toBe(404);
    expect(await problemOf(res)).toMatchObject({ detail: "gone" });
  });
});

describe("API description", () => {
  it("serves an OpenAPI 3.1 document listing every endpoint", async () => {
    const res = await createApp({ crashes: stubStore() }).request(
      "/openapi.json",
    );
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };

    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/healthz",
      "/v1/crashes",
      "/v1/crashes/{id}",
      "/v1/states/{state}/cities/{city}/crashes",
    ]);
  });

  it("serves interactive docs at /docs and redirects / there", async () => {
    const app = createApp({ crashes: stubStore() });
    const docs = await app.request("/docs");
    const root = await app.request("/");

    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    expect(await docs.text()).toContain("/openapi.json");
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/docs");
  });

  it.each(["/v1/crashes", "/openapi.json"])(
    "allows browsers on any origin to fetch %s",
    async (path) => {
      const res = await createApp({ crashes: stubStore() }).request(path, {
        headers: { Origin: "https://example.com" },
      });

      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    },
  );
});
