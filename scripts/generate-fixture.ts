/**
 * Writes fixtures/crashes.csv: 1,000 synthetic crashes in the exact CSV format of the
 * Kaggle US Accidents dataset (same headers, value formats and gaps). The rows are made
 * up, so the file carries no dataset license. Run with `pnpm fixture:generate`; the
 * output is deterministic, so re-running produces the same file.
 */
import { writeFileSync } from "node:fs";

const ROWS = 1000;
const OUTPUT = new URL("../fixtures/crashes.csv", import.meta.url);

const HEADERS = [
  "ID",
  "Source",
  "Severity",
  "Start_Time",
  "End_Time",
  "Start_Lat",
  "Start_Lng",
  "End_Lat",
  "End_Lng",
  "Distance(mi)",
  "Description",
  "Street",
  "City",
  "County",
  "State",
  "Zipcode",
  "Country",
  "Timezone",
  "Airport_Code",
  "Weather_Timestamp",
  "Temperature(F)",
  "Wind_Chill(F)",
  "Humidity(%)",
  "Pressure(in)",
  "Visibility(mi)",
  "Wind_Direction",
  "Wind_Speed(mph)",
  "Precipitation(in)",
  "Weather_Condition",
  "Amenity",
  "Bump",
  "Crossing",
  "Give_Way",
  "Junction",
  "No_Exit",
  "Railway",
  "Roundabout",
  "Station",
  "Stop",
  "Traffic_Calming",
  "Traffic_Signal",
  "Turning_Loop",
  "Sunrise_Sunset",
  "Civil_Twilight",
  "Nautical_Twilight",
  "Astronomical_Twilight",
] as const;

type City = {
  city: string;
  county: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  airport: string;
};

const ZONES: Record<string, string> = {
  CA: "US/Pacific",
  WA: "US/Pacific",
  AZ: "US/Mountain",
  CO: "US/Mountain",
  TX: "US/Central",
  FL: "US/Eastern",
  GA: "US/Eastern",
  NY: "US/Eastern",
  OH: "US/Eastern",
};

// Average temperature (°F) in January and July, for a rough seasonal curve.
const CLIMATE: Record<string, [number, number]> = {
  CA: [57, 75],
  WA: [41, 70],
  AZ: [56, 95],
  CO: [31, 75],
  TX: [52, 85],
  FL: [65, 83],
  GA: [48, 82],
  NY: [30, 75],
  OH: [29, 74],
};

// Columbus exists in both Ohio and Georgia, so lookups must match on state too.
const CITIES: City[] = [
  ["Los Angeles", "Los Angeles", "CA", "900", 34.0522, -118.2437, "KCQT"],
  ["San Diego", "San Diego", "CA", "921", 32.7157, -117.1611, "KSAN"],
  ["Sacramento", "Sacramento", "CA", "958", 38.5816, -121.4944, "KSAC"],
  ["San Jose", "Santa Clara", "CA", "951", 37.3382, -121.8863, "KSJC"],
  ["Seattle", "King", "WA", "981", 47.6062, -122.3321, "KBFI"],
  ["Spokane", "Spokane", "WA", "992", 47.6588, -117.426, "KGEG"],
  ["Phoenix", "Maricopa", "AZ", "850", 33.4484, -112.074, "KPHX"],
  ["Tucson", "Pima", "AZ", "857", 32.2226, -110.9747, "KTUS"],
  ["Denver", "Denver", "CO", "802", 39.7392, -104.9903, "KDEN"],
  ["Colorado Springs", "El Paso", "CO", "809", 38.8339, -104.8214, "KCOS"],
  ["Houston", "Harris", "TX", "770", 29.7604, -95.3698, "KHOU"],
  ["Dallas", "Dallas", "TX", "752", 32.7767, -96.797, "KDAL"],
  ["Austin", "Travis", "TX", "787", 30.2672, -97.7431, "KAUS"],
  ["San Antonio", "Bexar", "TX", "782", 29.4241, -98.4936, "KSAT"],
  ["Miami", "Miami-Dade", "FL", "331", 25.7617, -80.1918, "KMIA"],
  ["Orlando", "Orange", "FL", "328", 28.5383, -81.3792, "KORL"],
  ["Tampa", "Hillsborough", "FL", "336", 27.9506, -82.4572, "KTPA"],
  ["Columbus", "Muscogee", "GA", "319", 32.461, -84.9877, "KCSG"],
  ["Atlanta", "Fulton", "GA", "303", 33.749, -84.388, "KATL"],
  ["New York", "New York", "NY", "100", 40.7128, -74.006, "KNYC"],
  ["Buffalo", "Erie", "NY", "142", 42.8864, -78.8784, "KBUF"],
  ["Rochester", "Monroe", "NY", "146", 43.1566, -77.6088, "KROC"],
  ["Columbus", "Franklin", "OH", "432", 39.9612, -82.9988, "KCMH"],
  ["Cleveland", "Cuyahoga", "OH", "441", 41.4993, -81.6944, "KCLE"],
  ["Cincinnati", "Hamilton", "OH", "452", 39.1031, -84.512, "KLUK"],
  ["Dayton", "Montgomery", "OH", "454", 39.7589, -84.1916, "KDAY"],
].map(([city, county, state, zip, lat, lng, airport]) => ({
  city,
  county,
  state,
  zip,
  lat,
  lng,
  airport,
})) as City[];

const ROADS = [
  "I-5 N",
  "I-10 W",
  "I-35 S",
  "I-70 E",
  "I-71 N",
  "I-75 S",
  "I-90 E",
  "I-95 N",
  "US-101 S",
  "Main St",
  "Broadway",
  "Market St",
  "Highway 99",
  "N High St",
  "E Washington Ave",
  "State Route 4",
];
const CROSS = ["Exit 12", "Exit 108", "Oak St", "5th Ave", "Elm St", "Park Rd"];
const CONDITIONS = [
  "Clear",
  "Fair",
  "Partly Cloudy",
  "Mostly Cloudy",
  "Cloudy",
  "Overcast",
  "Light Rain",
  "Rain",
  "Heavy Rain",
  "Fog",
  "Haze",
  "Light Snow",
  "Snow",
  "Thunderstorm",
];
const WIND = ["N", "NNE", "NE", "E", "SE", "S", "SW", "W", "NW", "CALM", "VAR"];

// mulberry32: a small seeded PRNG, so the fixture is reproducible.
let seed = 20230331;
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T;
const chance = (p: number) => random() < p;
const between = (min: number, max: number) => min + random() * (max - min);
const flag = (p: number) => (chance(p) ? "True" : "False");
const maybe = (p: number, value: () => string) => (chance(p) ? "" : value());

const pad = (n: number) => String(n).padStart(2, "0");
function localTime(date: Date, fraction: boolean): string {
  // The dataset writes local wall-clock times without an offset. Dates here are built
  // and read in UTC purely as a calendar, so no time zone math happens in this script.
  const text = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return fraction ? `${text}.000000000` : text;
}

function daylight(hour: number, sunrise: number, sunset: number): string {
  return hour >= sunrise && hour < sunset ? "Day" : "Night";
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const START = Date.UTC(2016, 1, 8);
const END = Date.UTC(2023, 2, 31);

function row(index: number): string[] {
  const place = pick(CITIES);
  const start = new Date(START + Math.floor(random() * (END - START)));
  start.setUTCSeconds(0);
  const end = new Date(start.getTime() + Math.round(between(15, 360)) * 60_000);
  const weather = new Date(
    start.getTime() - Math.round(between(0, 50)) * 60_000,
  );
  weather.setUTCSeconds(0);
  const fraction = chance(0.3);

  const [winter, summer] = CLIMATE[place.state] as [number, number];
  const season = (1 - Math.cos((2 * Math.PI * start.getUTCMonth()) / 12)) / 2;
  const temperature = winter + (summer - winter) * season + between(-8, 8);
  const condition = pick(
    temperature < 34
      ? CONDITIONS
      : CONDITIONS.filter((c) => !c.includes("Snow")),
  );
  const startLat = place.lat + between(-0.08, 0.08);
  const startLng = place.lng + between(-0.08, 0.08);
  const hasEnd = chance(0.5);
  const road = pick(ROADS);
  const hour = start.getUTCHours();
  const severity = pick([
    1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4,
  ]);

  return [
    `SYN-${index}`,
    pick(["Source1", "Source1", "Source2", "Source2", "Source3"]),
    String(severity),
    localTime(start, fraction),
    localTime(end, fraction),
    startLat.toFixed(6),
    startLng.toFixed(6),
    hasEnd ? (startLat + between(-0.02, 0.02)).toFixed(6) : "",
    hasEnd ? (startLng + between(-0.02, 0.02)).toFixed(6) : "",
    hasEnd ? between(0.01, 4).toFixed(3) : "0.0",
    pick([
      `Accident on ${road} at ${pick(CROSS)}.`,
      `Incident on ${road} near ${pick(CROSS)}. Expect delays.`,
      `Lane blocked due to accident on ${road}.`,
      `Right lane blocked due to accident on ${road}, near ${pick(CROSS)}.`,
    ]),
    road,
    // A few rows have no city, as in the dataset.
    index % 250 === 0 ? "" : place.city,
    place.county,
    place.state,
    chance(0.3)
      ? `${place.zip}${pad(Math.floor(between(1, 99)))}-${String(Math.floor(between(1000, 9999)))}`
      : `${place.zip}${pad(Math.floor(between(1, 99)))}`,
    "US",
    // About 1% of rows have no time zone; the loader leaves their times NULL.
    index % 97 === 0 ? "" : (ZONES[place.state] as string),
    maybe(0.02, () => place.airport),
    maybe(0.02, () => localTime(weather, fraction)),
    maybe(0.03, () => temperature.toFixed(1)),
    temperature < 50 && chance(0.6)
      ? (temperature - between(0, 10)).toFixed(1)
      : "",
    maybe(0.03, () => String(Math.round(between(20, 100)))),
    maybe(0.03, () => between(29.2, 30.5).toFixed(2)),
    maybe(0.03, () => (chance(0.8) ? 10 : between(0.25, 9.5)).toFixed(1)),
    maybe(0.03, () => pick(WIND)),
    maybe(0.08, () => between(0, 25).toFixed(1)),
    condition.includes("Rain") || condition.includes("Snow")
      ? between(0, 0.5).toFixed(2)
      : maybe(0.6, () => "0.0"),
    maybe(0.02, () => condition),
    flag(0.01),
    flag(0.005),
    flag(0.1),
    flag(0.01),
    flag(0.07),
    flag(0.005),
    flag(0.01),
    flag(0.005),
    flag(0.03),
    flag(0.03),
    flag(0.005),
    flag(0.15),
    "False",
    maybe(0.005, () => daylight(hour, 7, 19)),
    maybe(0.005, () => daylight(hour, 6, 20)),
    maybe(0.005, () => daylight(hour, 6, 20)),
    maybe(0.005, () => daylight(hour, 5, 21)),
  ];
}

const lines = [HEADERS.join(",")];
for (let index = 1; index <= ROWS; index++) {
  lines.push(row(index).map(csvField).join(","));
}
writeFileSync(OUTPUT, `${lines.join("\n")}\n`);
console.log(`Wrote ${ROWS} rows to ${OUTPUT.pathname}`);
