import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { crashes } from "../schema.js";
import { type Crash, toCrash } from "./model.js";

/** Read access to crashes. The app depends on this, so tests can swap in a stub. */
export interface CrashStore {
  /** Newest crashes first; crashes with no start time come last. */
  list(limit: number): Promise<Crash[]>;
  get(id: string): Promise<Crash | undefined>;
  /** Crashes in one city, matching the city name case-insensitively, newest first. */
  listByCity(state: string, city: string, limit: number): Promise<Crash[]>;
}

// Matches the crashes_start_time_id_idx index, so Postgres reads rows in index order.
const newestFirst = [sql`${crashes.startTime} desc nulls last`, crashes.id];

export function createCrashStore(db: NodePgDatabase): CrashStore {
  return {
    async list(limit) {
      const rows = await db
        .select()
        .from(crashes)
        .orderBy(...newestFirst)
        .limit(limit);
      return rows.map(toCrash);
    },

    async get(id) {
      const [row] = await db.select().from(crashes).where(eq(crashes.id, id));
      return row && toCrash(row);
    },

    async listByCity(state, city, limit) {
      const rows = await db
        .select()
        .from(crashes)
        .where(
          and(
            eq(crashes.state, state.toUpperCase()),
            // Same expression as crashes_state_lower_city_idx, so the index applies.
            sql`lower(${crashes.city}) = lower(${city})`,
          ),
        )
        .orderBy(...newestFirst)
        .limit(limit);
      return rows.map(toCrash);
    },
  };
}
