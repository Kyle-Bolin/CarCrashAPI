import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { getTableColumns } from "drizzle-orm";
import type pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { crashes } from "../schema.js";

export type LoadOptions = {
  /** Path to a US Accidents CSV, optionally gzipped (`.gz`). */
  file: string;
  /** Two-letter state codes to keep. Omit to load every state. */
  states?: string[];
  /** Keep crashes that started on or after this local date (YYYY-MM-DD). */
  from?: string;
  /** Keep crashes that started on or before this local date (YYYY-MM-DD). */
  to?: string;
};

export type LoadResult = {
  /** Data rows in the CSV. */
  read: number;
  /** Rows inserted or updated, one per distinct ID that passed the filters. */
  upserted: number;
  /** Rows dropped by the filters, for having no ID, or as repeats of an earlier ID. */
  skipped: number;
  /** Loaded rows whose times stay NULL because the row has no time zone. */
  withoutTimezone: number;
};

/**
 * The dataset names zones with the legacy `US/*` aliases, which current tzdata builds
 * (Debian, Ubuntu) no longer ship. Map them to canonical IANA names. Arizona doesn't
 * observe daylight saving time, so its `US/Mountain` rows use America/Phoenix.
 */
const LEGACY_ZONES: Record<string, string> = {
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
};

/** `Distance(mi)` → `distance`, `Start_Time` → `start_time`: the schema's column names. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/\(.*\)\s*$/, "")
    .trim()
    .toLowerCase();
}

/** Splits one CSV line, honoring double-quoted fields. Used for the header only. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

function openCsv(file: string): Readable {
  const stream = createReadStream(file);
  if (!file.endsWith(".gz")) return stream;
  // pipe() doesn't forward errors, so a missing file would otherwise hang the reader.
  const gunzip = createGunzip();
  stream.on("error", (error) => gunzip.destroy(error));
  gunzip.on("close", () => stream.destroy());
  return stream.pipe(gunzip);
}

export async function readHeader(file: string): Promise<string[]> {
  const stream = openCsv(file);
  let text = "";
  try {
    for await (const chunk of stream) {
      text += chunk.toString("utf8");
      if (text.includes("\n")) break;
    }
  } finally {
    stream.destroy();
  }
  const line = (text.split("\n")[0] ?? "").replace(/^﻿/, "").trimEnd();
  if (line === "") throw new Error(`${file} is empty`);
  return parseCsvLine(line);
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Builds the SELECT that turns staged text columns into typed crash rows. Staging
 * columns are named c0, c1, … by header position, so no header text reaches the SQL.
 */
export function buildSelect(headers: string[]) {
  const position = new Map<string, number>();
  headers.forEach((header, index) => {
    const name = normalizeHeader(header);
    if (!position.has(name)) position.set(name, index);
  });
  const raw = (name: string) => {
    const index = position.get(name);
    return index === undefined ? "NULL::text" : `nullif(c${index}, '')`;
  };
  if (!position.has("id")) throw new Error("The CSV has no ID column");

  const zoneCases = Object.entries(LEGACY_ZONES)
    .map(([alias, zone]) => `WHEN ${quote(alias)} THEN ${quote(zone)}`)
    .join(" ");
  const zone = `CASE
      WHEN ${raw("timezone")} = 'US/Mountain' AND upper(${raw("state")}) = 'AZ' THEN 'America/Phoenix'
      ELSE CASE ${raw("timezone")} ${zoneCases} ELSE ${raw("timezone")} END
    END`;

  const columns = Object.values(getTableColumns(crashes)).map((column) => {
    const value = raw(column.name);
    const type = column.getSQLType();
    let expression: string;
    if (column.name === "timezone") expression = "zone";
    else if (column.name === "state") expression = `upper(${value})`;
    else if (type === "timestamp with time zone")
      expression = `(${value}::timestamp AT TIME ZONE zone)`;
    else if (type === "text") expression = value;
    else expression = `${value}::${type}`;
    return { name: column.name, expression };
  });

  return {
    /** Every staged row with its resolved zone and the fields the filters need. */
    source: `SELECT *, ${zone} AS zone, ${raw("id")} AS row_id,
        upper(${raw("state")}) AS row_state,
        ${raw("start_time")}::timestamp AS row_local_start
      FROM crashes_staging`,
    columns,
  };
}

/**
 * Loads a US Accidents CSV into `crashes` in one transaction: COPY into a temporary
 * staging table, convert local times to UTC with each row's time zone, then upsert by ID.
 * Re-running with the same file changes nothing; a newer file updates rows in place.
 */
export async function loadCrashes(
  client: pg.ClientBase,
  options: LoadOptions,
): Promise<LoadResult> {
  const headers = await readHeader(options.file);
  const { source, columns } = buildSelect(headers);
  const states = options.states?.length
    ? options.states.map((state) => state.toUpperCase())
    : null;
  const filter = `row_id IS NOT NULL
    AND ($1::text[] IS NULL OR row_state = ANY($1))
    AND ($2::date IS NULL OR row_local_start >= $2::date)
    AND ($3::date IS NULL OR row_local_start < $3::date + 1)`;
  const params = [states, options.from ?? null, options.to ?? null];

  await client.query("BEGIN");
  try {
    const staging = headers.map((_, index) => `c${index} text`).join(", ");
    await client.query(
      `CREATE TEMP TABLE crashes_staging (${staging}) ON COMMIT DROP`,
    );
    const copy = client.query(
      copyFrom(
        "COPY crashes_staging FROM STDIN WITH (FORMAT csv, HEADER true)",
      ),
    );
    await pipeline(openCsv(options.file), copy);
    const read = Number(copy.rowCount);

    const unknown = await client.query<{ zone: string }>(
      `SELECT DISTINCT zone FROM (${source}) s
       WHERE zone IS NOT NULL
         AND zone NOT IN (SELECT name FROM pg_timezone_names)
       ORDER BY zone`,
    );
    if (unknown.rows.length > 0) {
      const zones = unknown.rows.map((row) => row.zone).join(", ");
      throw new Error(`Unknown time zones in the CSV: ${zones}`);
    }

    const stats = await client.query<{ without_timezone: string }>(
      `SELECT count(*) FILTER (WHERE zone IS NULL AND row_local_start IS NOT NULL)
         AS without_timezone
       FROM (${source}) s WHERE ${filter}`,
      params,
    );

    const names = columns.map((column) => column.name);
    const inserted = await client.query(
      `INSERT INTO crashes (${names.join(", ")})
       SELECT DISTINCT ON (row_id) ${columns.map((c) => c.expression).join(", ")}
       FROM (${source}) s
       WHERE ${filter}
       ORDER BY row_id
       ON CONFLICT (id) DO UPDATE SET
         ${names
           .filter((name) => name !== "id")
           .map((name) => `${name} = excluded.${name}`)
           .join(", ")}`,
      params,
    );
    await client.query("COMMIT");
    // Fresh planner statistics, so the first queries after a big load use the indexes.
    await client.query("ANALYZE crashes");

    const upserted = inserted.rowCount ?? 0;
    return {
      read,
      upserted,
      skipped: read - upserted,
      withoutTimezone: Number(stats.rows[0]?.without_timezone ?? 0),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
