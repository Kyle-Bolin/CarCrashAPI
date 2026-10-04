import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { describeWithDatabase, withClient } from "../testing/db.js";
import {
  buildSelect,
  loadCrashes,
  normalizeHeader,
  parseCsvLine,
  readHeader,
} from "./load.js";

const dir = mkdtempSync(join(tmpdir(), "crash-loader-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let files = 0;
function csv(lines: string[], { gzip = false } = {}): string {
  const path = join(dir, `${++files}.csv${gzip ? ".gz" : ""}`);
  const text = `${lines.join("\n")}\n`;
  writeFileSync(path, gzip ? gzipSync(text) : text);
  return path;
}

describe("normalizeHeader", () => {
  it.each([
    ["ID", "id"],
    ["Start_Time", "start_time"],
    ["Distance(mi)", "distance"],
    ["Temperature(F)", "temperature"],
    ["Humidity(%)", "humidity"],
    [" Wind_Speed(mph) ", "wind_speed"],
  ])("maps %s to %s", (header, column) => {
    expect(normalizeHeader(header)).toBe(column);
  });
});

describe("parseCsvLine", () => {
  it("splits on commas outside quotes and unescapes doubled quotes", () => {
    expect(parseCsvLine('a,"b,c","say ""hi""",')).toEqual([
      "a",
      "b,c",
      'say "hi"',
      "",
    ]);
  });
});

describe("readHeader", () => {
  it("reads the first line, dropping a byte-order mark and CRLF", async () => {
    const file = csv(["﻿ID,State\r", "A-1,OH"]);
    expect(await readHeader(file)).toEqual(["ID", "State"]);
  });

  it("reads gzipped files", async () => {
    const file = csv(["ID,City", "A-1,Dayton"], { gzip: true });
    expect(await readHeader(file)).toEqual(["ID", "City"]);
  });

  it("rejects an empty file", async () => {
    const file = join(dir, "empty.csv");
    writeFileSync(file, "");
    await expect(readHeader(file)).rejects.toThrow("is empty");
  });

  it("fails, rather than hangs, on a missing gzipped file", async () => {
    await expect(readHeader(join(dir, "missing.csv.gz"))).rejects.toThrow(
      "ENOENT",
    );
  });
});

describe("buildSelect", () => {
  it("requires an ID column", () => {
    expect(() => buildSelect(["State", "City"])).toThrow("no ID column");
  });

  it("fills columns the CSV lacks with NULL", () => {
    const { columns } = buildSelect(["ID"]);
    const temperature = columns.find((c) => c.name === "temperature");
    expect(temperature?.expression).toBe("NULL::text::double precision");
  });
});

const HEADER =
  "ID,Severity,Start_Time,End_Time,Distance(mi),City,State,Timezone,Weather_Timestamp,Temperature(F),Traffic_Signal,Sunrise_Sunset";

describeWithDatabase("loadCrashes", () => {
  const ids = "id LIKE 'T-%'";
  afterEach(() =>
    withClient((client) => client.query(`DELETE FROM crashes WHERE ${ids}`)),
  );

  const rows = (where = "true") =>
    withClient(async (client) => {
      await client.query("SET TIME ZONE 'UTC'");
      const result = await client.query(
        `SELECT id, severity, start_time::text, end_time::text, distance, city, state,
           timezone, weather_timestamp::text, temperature, traffic_signal, sunrise_sunset
         FROM crashes WHERE ${ids} AND ${where} ORDER BY id`,
      );
      return result.rows;
    });

  const load = (lines: string[], options = {}) =>
    withClient((client) =>
      loadCrashes(client, { file: csv([HEADER, ...lines]), ...options }),
    );

  it("converts local times to UTC with each row's time zone", async () => {
    await load([
      "T-1,2,2021-01-15 08:00:00,2021-01-15 09:30:00,1.5,Columbus,OH,US/Eastern,2021-01-15 07:53:00,30.2,True,Day",
      "T-2,2,2021-07-15 08:00:00.000000000,,0,Columbus,OH,US/Eastern,,,False,Day",
      "T-3,2,2021-07-15 08:00:00,,,Phoenix,AZ,US/Mountain,,,,",
      "T-4,2,2021-07-15 08:00:00,,,Denver,CO,US/Mountain,,,,",
      "T-5,2,2021-07-15 08:00:00,,,Houston,TX,US/Central,,,,",
      "T-6,2,2021-07-15 08:00:00,,,Seattle,WA,US/Pacific,,,,",
    ]);

    expect(await rows()).toEqual([
      {
        id: "T-1",
        severity: 2,
        start_time: "2021-01-15 13:00:00+00",
        end_time: "2021-01-15 14:30:00+00",
        distance: 1.5,
        city: "Columbus",
        state: "OH",
        timezone: "America/New_York",
        weather_timestamp: "2021-01-15 12:53:00+00",
        temperature: 30.2,
        traffic_signal: true,
        sunrise_sunset: "Day",
      },
      expect.objectContaining({
        id: "T-2",
        start_time: "2021-07-15 12:00:00+00", // EDT is UTC-4
        traffic_signal: false,
      }),
      // Arizona has no daylight saving time, so July is still UTC-7.
      expect.objectContaining({
        start_time: "2021-07-15 15:00:00+00",
        timezone: "America/Phoenix",
      }),
      expect.objectContaining({
        start_time: "2021-07-15 14:00:00+00",
        timezone: "America/Denver",
      }),
      expect.objectContaining({
        start_time: "2021-07-15 13:00:00+00",
        timezone: "America/Chicago",
      }),
      expect.objectContaining({
        start_time: "2021-07-15 15:00:00+00",
        timezone: "America/Los_Angeles",
      }),
    ]);
  });

  it("keeps missing values NULL instead of 0 or empty strings", async () => {
    const result = await load(["T-1,,2021-01-15 08:00:00,,,,oh,,,,,"]);

    expect(result.withoutTimezone).toBe(1);
    expect(await rows()).toEqual([
      {
        id: "T-1",
        severity: null,
        start_time: null, // no time zone, so the instant is unknown
        end_time: null,
        distance: null,
        city: null,
        state: "OH",
        timezone: null,
        weather_timestamp: null,
        temperature: null,
        traffic_signal: null,
        sunrise_sunset: null,
      },
    ]);
  });

  it("upserts by ID, so re-running updates rows instead of duplicating them", async () => {
    await load([
      "T-1,2,2021-01-15 08:00:00,,,Dayton,OH,US/Eastern,,,,",
      "T-2,2,2021-01-15 08:00:00,,,Dayton,OH,US/Eastern,,,,",
    ]);
    const again = await load([
      "T-1,4,2021-01-15 08:00:00,,,Dayton,OH,US/Eastern,,,,",
      "T-2,2,2021-01-15 08:00:00,,,Dayton,OH,US/Eastern,,,,",
    ]);

    expect(again).toEqual({
      read: 2,
      upserted: 2,
      skipped: 0,
      withoutTimezone: 0,
    });
    expect((await rows()).map((r) => [r.id, r.severity])).toEqual([
      ["T-1", 4],
      ["T-2", 2],
    ]);
  });

  it("keeps one row per repeated ID and skips rows without an ID", async () => {
    const result = await load([
      "T-1,1,,,,Dayton,OH,,,,,",
      "T-1,1,,,,Dayton,OH,,,,,",
      ",1,,,,Dayton,OH,,,,,",
    ]);

    expect(result).toMatchObject({ read: 3, upserted: 1, skipped: 2 });
  });

  it("filters by state and local start date", async () => {
    const result = await load(
      [
        "T-1,2,2020-12-31 23:59:00,,,Dayton,OH,US/Eastern,,,,",
        "T-2,2,2021-01-01 00:00:00,,,Dayton,OH,US/Eastern,,,,",
        "T-3,2,2021-12-31 23:59:00,,,Atlanta,GA,US/Eastern,,,,",
        "T-4,2,2022-01-01 00:00:00,,,Dayton,OH,US/Eastern,,,,",
        "T-5,2,2021-06-01 12:00:00,,,Austin,TX,US/Central,,,,",
        "T-6,2,,,,Dayton,OH,US/Eastern,,,,",
      ],
      { states: ["oh", "GA"], from: "2021-01-01", to: "2021-12-31" },
    );

    expect(result).toMatchObject({ read: 6, upserted: 2, skipped: 4 });
    expect((await rows()).map((r) => r.id)).toEqual(["T-2", "T-3"]);
  });

  it("ignores unknown columns and accepts gzipped files", async () => {
    const file = csv(
      [
        "ID,Number,Side,State,Timezone,Start_Time",
        "T-1,123,R,OH,US/Eastern,2021-01-15 08:00:00",
      ],
      { gzip: true },
    );
    await withClient((client) => loadCrashes(client, { file }));

    expect(await rows()).toEqual([
      expect.objectContaining({
        id: "T-1",
        start_time: "2021-01-15 13:00:00+00",
      }),
    ]);
  });

  it("rejects unknown time zones and leaves the table untouched", async () => {
    await expect(
      load([
        "T-1,2,2021-01-15 08:00:00,,,Dayton,OH,US/Eastern,,,,",
        "T-2,2,2021-01-15 08:00:00,,,Dayton,OH,Mars/Olympus,,,,",
      ]),
    ).rejects.toThrow("Unknown time zones in the CSV: Mars/Olympus");
    expect(await rows()).toEqual([]);
  });

  it("rolls back when a value doesn't parse", async () => {
    await expect(
      load(["T-1,high,2021-01-15 08:00:00,,,Dayton,OH,US/Eastern,,,,"]),
    ).rejects.toThrow(/invalid input syntax for type integer/);
    expect(await rows()).toEqual([]);
  });
});
