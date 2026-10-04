import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, runMigrations } from "./migrate.js";
import {
  describeWithDatabase,
  TEST_DATABASE_URL,
  withClient,
} from "./testing/db.js";

const journal = JSON.parse(
  readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
) as { entries: { tag: string }[] };

describe("MIGRATIONS_FOLDER", () => {
  it("points at the committed migrations", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
    for (const { tag } of journal.entries) {
      expect(existsSync(join(MIGRATIONS_FOLDER, `${tag}.sql`))).toBe(true);
    }
  });
});

describeWithDatabase("runMigrations", () => {
  it("is a no-op on an up-to-date database and records every migration", async () => {
    await runMigrations(TEST_DATABASE_URL as string);

    const applied = await withClient(
      async (client) =>
        (
          await client.query<{ count: string }>(
            "SELECT count(*) FROM drizzle.__drizzle_migrations",
          )
        ).rows[0]?.count,
    );
    expect(Number(applied)).toBe(journal.entries.length);
  });

  it("fails with the connection error when the database is unreachable", async () => {
    await expect(
      runMigrations("postgres://u:p@127.0.0.1:1/none"),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
