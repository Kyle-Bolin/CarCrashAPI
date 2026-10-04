import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Database tests share one crashes table, so test files run one at a time.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Entry points only wire code to a runtime; behavior lives in the modules they call.
      exclude: [
        "src/**/*.test.ts",
        "src/testing/**",
        "src/server.ts",
        "src/lambda.ts",
        "src/cli/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
