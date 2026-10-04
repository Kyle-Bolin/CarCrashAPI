import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { crashes } from "../schema.js";
import { CrashSchema, toCrash } from "./model.js";

type Row = typeof crashes.$inferSelect;

const empty = Object.fromEntries(
  Object.keys(getTableColumns(crashes)).map((key) => [key, null]),
) as unknown as Row;

describe("toCrash", () => {
  it("documents every database column in the API schema", () => {
    expect(Object.keys(CrashSchema.shape).sort()).toEqual(
      Object.keys(getTableColumns(crashes)).sort(),
    );
  });

  it("writes timestamps as ISO 8601 UTC strings", () => {
    const crash = toCrash({
      ...empty,
      id: "A-1",
      startTime: new Date("2021-01-15T13:00:00Z"),
      weatherTimestamp: new Date("2021-01-15T12:53:00Z"),
    });

    expect(crash.startTime).toBe("2021-01-15T13:00:00.000Z");
    expect(crash.weatherTimestamp).toBe("2021-01-15T12:53:00.000Z");
    expect(crash.endTime).toBeNull();
  });

  it("keeps missing values null and passes known values through", () => {
    const crash = toCrash({ ...empty, id: "A-1", temperature: 0, bump: false });

    expect(crash.temperature).toBe(0);
    expect(crash.bump).toBe(false);
    expect(crash.humidity).toBeNull();
    expect(CrashSchema.parse(crash)).toEqual(crash);
  });

  it("drops day/night values outside Day and Night", () => {
    const crash = toCrash({
      ...empty,
      id: "A-1",
      sunriseSunset: "Night",
      civilTwilight: "Dusk",
    });

    expect(crash.sunriseSunset).toBe("Night");
    expect(crash.civilTwilight).toBeNull();
  });
});
