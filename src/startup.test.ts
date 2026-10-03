import { describe, expect, it, vi } from "vitest";
import { prepare } from "./startup.js";

const env = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };

describe("prepare", () => {
  it("returns the config when the database is reachable", async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    await expect(prepare(env, check)).resolves.toMatchObject({ PORT: 3000 });
    expect(check).toHaveBeenCalledWith(env.DATABASE_URL);
  });

  it("fails on invalid config without touching the database", async () => {
    const check = vi.fn();
    await expect(prepare({}, check)).rejects.toThrow(/DATABASE_URL/);
    expect(check).not.toHaveBeenCalled();
  });

  it("fails with a clear message when the database is unreachable", async () => {
    const check = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
    await expect(prepare(env, check)).rejects.toThrow(
      "Cannot reach the database: connect ECONNREFUSED",
    );
  });
});
