import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * One row per crash in the US Accidents dataset. Column names are unquoted snake_case
 * so hand-written SQL needs no quoting. Everything except `id` is nullable: the dataset
 * has gaps, and a missing value must stay NULL rather than become 0 or "".
 */
export const crashes = pgTable(
  "crashes",
  {
    id: text("id").primaryKey(),
    source: text("source"),
    severity: integer("severity"),
    startTime: timestamp("start_time", { mode: "date" }),
    endTime: timestamp("end_time", { mode: "date" }),
    startLat: doublePrecision("start_lat"),
    startLng: doublePrecision("start_lng"),
    endLat: doublePrecision("end_lat"),
    endLng: doublePrecision("end_lng"),
    distance: doublePrecision("distance"),
    description: text("description"),
    street: text("street"),
    city: text("city"),
    county: text("county"),
    state: text("state"),
    zipcode: text("zipcode"),
    country: text("country"),
    timezone: text("timezone"),
    airportCode: text("airport_code"),
    weatherTimestamp: timestamp("weather_timestamp", { mode: "date" }),
    temperature: doublePrecision("temperature"),
    windChill: doublePrecision("wind_chill"),
    humidity: doublePrecision("humidity"),
    pressure: doublePrecision("pressure"),
    visibility: doublePrecision("visibility"),
    windDirection: text("wind_direction"),
    windSpeed: doublePrecision("wind_speed"),
    precipitation: doublePrecision("precipitation"),
    weatherCondition: text("weather_condition"),
    amenity: boolean("amenity"),
    bump: boolean("bump"),
    crossing: boolean("crossing"),
    giveWay: boolean("give_way"),
    junction: boolean("junction"),
    noExit: boolean("no_exit"),
    railway: boolean("railway"),
    roundabout: boolean("roundabout"),
    station: boolean("station"),
    stop: boolean("stop"),
    trafficCalming: boolean("traffic_calming"),
    trafficSignal: boolean("traffic_signal"),
    turningLoop: boolean("turning_loop"),
    sunriseSunset: text("sunrise_sunset"),
    civilTwilight: text("civil_twilight"),
    nauticalTwilight: text("nautical_twilight"),
    astronomicalTwilight: text("astronomical_twilight"),
  },
  (table) => [
    index("crashes_state_lower_city_idx").on(
      table.state,
      sql`lower(${table.city})`,
    ),
    index("crashes_start_time_idx").on(table.startTime),
  ],
);
