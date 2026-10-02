import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const valid = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(valid)).toEqual({
      ...valid,
      PORT: 3000,
      LOG_LEVEL: "info",
    });
  });

  it("coerces PORT and accepts LOG_LEVEL", () => {
    expect(
      loadConfig({ ...valid, PORT: "8080", LOG_LEVEL: "debug" }),
    ).toMatchObject({
      PORT: 8080,
      LOG_LEVEL: "debug",
    });
  });

  it("names every invalid variable", () => {
    expect(() => loadConfig({ PORT: "abc", LOG_LEVEL: "loud" })).toThrow(
      ConfigError,
    );
    try {
      loadConfig({ PORT: "abc", LOG_LEVEL: "loud" });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("PORT");
      expect(message).toContain("LOG_LEVEL");
    }
  });

  it("rejects non-postgres URLs and out-of-range ports", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://localhost/db" })).toThrow(
      /postgres/,
    );
    expect(() => loadConfig({ DATABASE_URL: "not a url" })).toThrow(
      /valid URL/,
    );
    expect(() => loadConfig({ ...valid, PORT: "70000" })).toThrow(/PORT/);
  });
});
