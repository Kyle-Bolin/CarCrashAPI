import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { crashes } from "./schema.js";
import { describeWithDatabase, withClient } from "./testing/db.js";

const columns = Object.values(getTableColumns(crashes));

describe("crashes schema definition", () => {
  it("uses unquoted-safe snake_case column names", () => {
    for (const column of columns) {
      expect(column.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("declares the two parity indexes", () => {
    const names = getTableConfig(crashes).indexes.map((i) => i.config.name);
    expect(names).toEqual([
      "crashes_state_lower_city_idx",
      "crashes_start_time_id_idx",
    ]);
  });

  it("makes only the id column required", () => {
    const required = columns.filter((c) => c.notNull).map((c) => c.name);
    expect(required).toEqual(["id"]);
  });
});

// CI's "Tests" job runs `pnpm db:migrate` on a fresh database first, so these check
// that the migrations produce the schema the code expects.
describeWithDatabase("migrated database", () => {
  const query = <T extends pg.QueryResultRow>(sql: string) =>
    withClient(async (client) => (await client.query<T>(sql)).rows);

  it("has the columns and nullability the code expects", async () => {
    const rows = await query<{ column_name: string; is_nullable: string }>(
      "select column_name, is_nullable from information_schema.columns where table_name = 'crashes'",
    );
    const actual = Object.fromEntries(
      rows.map((r) => [r.column_name, r.is_nullable === "YES"]),
    );
    const expected = Object.fromEntries(
      columns.map((c) => [c.name, !c.notNull]),
    );
    expect(actual).toEqual(expected);
  });

  it("stores the crash timestamps with a time zone", async () => {
    const rows = await query<{ column_name: string; data_type: string }>(
      "select column_name, data_type from information_schema.columns where table_name = 'crashes' and column_name in ('start_time', 'end_time', 'weather_timestamp') order by column_name",
    );
    expect(rows).toEqual([
      { column_name: "end_time", data_type: "timestamp with time zone" },
      { column_name: "start_time", data_type: "timestamp with time zone" },
      {
        column_name: "weather_timestamp",
        data_type: "timestamp with time zone",
      },
    ]);
  });

  it("indexes the parity queries", async () => {
    const rows = await query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'crashes'",
    );
    const defs = rows.map((r) => r.indexdef).join("\n");
    expect(defs).toContain("(state, lower(city))");
    expect(defs).toContain("(start_time DESC NULLS LAST, id)");
  });

  it("accepts the dataset's text ids and keeps NULL as NULL", async () => {
    await query("delete from crashes where id = 'A-1'");
    try {
      await query("insert into crashes (id, state) values ('A-1', 'OH')");
      const rows = await query<{ temperature: number | null }>(
        "select temperature from crashes where id = 'A-1'",
      );
      expect(rows[0]?.temperature).toBeNull();
    } finally {
      await query("delete from crashes where id = 'A-1'");
    }
  });
});
