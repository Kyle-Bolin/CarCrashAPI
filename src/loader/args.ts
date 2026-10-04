import { parseArgs } from "node:util";
import { z } from "zod";
import type { LoadOptions } from "./load.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2021-01-31")
  .refine((value) => !Number.isNaN(Date.parse(value)), "must be a real date");

const schema = z
  .object({
    file: z.string({ error: "is required" }).min(1, "is required"),
    states: z
      .string()
      .transform((value) =>
        value
          .split(",")
          .map((state) => state.trim().toUpperCase())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(z.string().regex(/^[A-Z]{2}$/, "must be two-letter codes"))
          .min(1, "must name at least one state"),
      )
      .optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .refine((args) => !args.from || !args.to || args.from <= args.to, {
    message: "must not be after --to",
    path: ["from"],
  });

export const USAGE =
  "Usage: data:load --file <csv or csv.gz> [--states OH,CA] [--from 2021-01-01] [--to 2021-12-31]";

/** Parses `data:load` arguments; throws with a readable message on bad input. */
export function parseLoadArgs(argv: string[]): LoadOptions {
  let values: Record<string, unknown>;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        file: { type: "string" },
        states: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
      strict: true,
    }));
  } catch (error) {
    throw new Error(`${(error as Error).message}\n${USAGE}`);
  }
  const result = schema.safeParse(values);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  --${String(issue.path[0])}: ${issue.message}`,
    );
    throw new Error(`Invalid arguments:\n${problems.join("\n")}\n${USAGE}`);
  }
  return result.data;
}
