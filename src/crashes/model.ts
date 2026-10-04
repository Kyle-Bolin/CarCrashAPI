import { z } from "@hono/zod-openapi";
import type { crashes } from "../schema.js";

const text = (description: string, example: string) =>
  z.string().nullable().openapi({ description, example });
const number = (description: string, example: number) =>
  z.number().nullable().openapi({ description, example });
const time = (description: string, example: string) =>
  z.iso.datetime().nullable().openapi({ description, example });
const flag = (description: string) =>
  z.boolean().nullable().openapi({ description, example: false });
const daylight = (description: string) =>
  z.enum(["Day", "Night"]).nullable().openapi({ description, example: "Day" });

/**
 * One crash. Field names are camelCase, units are in the descriptions, and a value the
 * dataset doesn't have is `null`, never 0 or "".
 */
export const CrashSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique crash ID from the dataset.",
      example: "A-2716600",
    }),
    source: text("Which upstream feed reported the crash.", "Source1"),
    severity: z.number().int().min(1).max(4).nullable().openapi({
      description: "Impact on traffic, from 1 (short delay) to 4 (long delay).",
      example: 2,
    }),
    startTime: time(
      "When the crash started, in UTC.",
      "2021-07-12T13:25:00.000Z",
    ),
    endTime: time(
      "When its impact on traffic ended, in UTC.",
      "2021-07-12T15:41:00.000Z",
    ),
    startLat: number("Latitude where the crash started.", 39.785123),
    startLng: number("Longitude where the crash started.", -105.037194),
    endLat: number("Latitude where the affected stretch of road ends.", 39.79),
    endLng: number(
      "Longitude where the affected stretch of road ends.",
      -105.04,
    ),
    distance: number("Length of road affected, in miles.", 0.951),
    description: text(
      "Free-text description from the source.",
      "Accident on I-70 E at Exit 12.",
    ),
    street: text("Street name.", "I-70 E"),
    city: text("City.", "Denver"),
    county: text("County.", "Denver"),
    state: text("Two-letter state code.", "CO"),
    zipcode: text("ZIP or ZIP+4 code.", "80202"),
    country: text("Country code.", "US"),
    timezone: text(
      "IANA time zone of the crash location. The dataset's legacy US/* names are mapped to canonical ones.",
      "America/Denver",
    ),
    airportCode: text("Nearest airport weather station.", "KDEN"),
    weatherTimestamp: time(
      "When the weather observation was taken, in UTC.",
      "2021-07-12T13:19:00.000Z",
    ),
    temperature: number("Temperature, in °F.", 78.1),
    windChill: number("Wind chill, in °F.", 78.1),
    humidity: number("Relative humidity, in percent.", 41),
    pressure: number("Air pressure, in inches of mercury.", 30.02),
    visibility: number("Visibility, in miles.", 10),
    windDirection: text("Wind direction, such as SW, CALM or VAR.", "SW"),
    windSpeed: number("Wind speed, in mph.", 8.1),
    precipitation: number("Precipitation, in inches.", 0),
    weatherCondition: text("Weather condition, such as Light Rain.", "Fair"),
    amenity: flag("An amenity is nearby."),
    bump: flag("A speed bump or hump is nearby."),
    crossing: flag("A crossing is nearby."),
    giveWay: flag("A give-way sign is nearby."),
    junction: flag("A junction is nearby."),
    noExit: flag("A no-exit sign is nearby."),
    railway: flag("A railway is nearby."),
    roundabout: flag("A roundabout is nearby."),
    station: flag("A station is nearby."),
    stop: flag("A stop sign is nearby."),
    trafficCalming: flag("Traffic calming is nearby."),
    trafficSignal: flag("A traffic signal is nearby."),
    turningLoop: flag("A turning loop is nearby."),
    sunriseSunset: daylight("Day or night, by sunrise and sunset."),
    civilTwilight: daylight("Day or night, by civil twilight."),
    nauticalTwilight: daylight("Day or night, by nautical twilight."),
    astronomicalTwilight: daylight("Day or night, by astronomical twilight."),
  })
  .openapi("Crash");

export type Crash = z.infer<typeof CrashSchema>;

export const CrashListSchema = z
  .object({ data: z.array(CrashSchema) })
  .openapi("CrashList");

type Row = typeof crashes.$inferSelect;

const iso = (value: Date | null) => value?.toISOString() ?? null;
const daylightValue = (value: string | null) =>
  value === "Day" || value === "Night" ? value : null;

/** Converts a database row to the API shape: ISO timestamps, known day/night values. */
export function toCrash(row: Row): Crash {
  return {
    ...row,
    startTime: iso(row.startTime),
    endTime: iso(row.endTime),
    weatherTimestamp: iso(row.weatherTimestamp),
    sunriseSunset: daylightValue(row.sunriseSunset),
    civilTwilight: daylightValue(row.civilTwilight),
    nauticalTwilight: daylightValue(row.nauticalTwilight),
    astronomicalTwilight: daylightValue(row.astronomicalTwilight),
  };
}
