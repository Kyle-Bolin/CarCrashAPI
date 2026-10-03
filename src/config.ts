import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .refine((value) => URL.canParse(value), "must be a valid URL")
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      "must start with postgres:// or postgresql://",
    ),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof schema>;

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid configuration:\n${problems.join("\n")}`);
  }
  return result.data;
}
