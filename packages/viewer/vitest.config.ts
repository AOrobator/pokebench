import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests read the schema source; the built server imports the agent's dist.
    alias: { "@pokebench/agent/events": fileURLToPath(new URL("../agent/src/events.ts", import.meta.url)) },
  },
  test: {
    maxWorkers: 8,
    include: ["src/**/*.test.ts"],
    setupFiles: ["../agent/test-support/no-io.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: { lines: 36, branches: 39, functions: 40, statements: 35 },
    },
  },
});
