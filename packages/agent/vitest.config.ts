import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // smoke.ts is an entrypoint (INV-6), exercised by `just smoke-llm`.
      exclude: ["src/**/*.test.ts", "src/smoke.ts"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
