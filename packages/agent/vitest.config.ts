import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 8,
    include: ["src/**/*.test.ts"],
    setupFiles: ["test-support/no-io.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts","test-support/whole-game-stream.ts"],
      // live.ts is the one live entrypoint (INV-6), exercised by `just smoke-llm` and `just run-agent`.
      exclude: ["src/**/*.test.ts", "src/live.ts"],
      thresholds: { lines: 63, branches: 54, functions: 57, statements: 58 },
    },
  },
});
