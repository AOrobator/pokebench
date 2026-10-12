import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // live.ts is the one live entrypoint (INV-6), exercised by `just smoke-llm` and `just run-agent`.
      exclude: ["src/**/*.test.ts", "src/live.ts"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
