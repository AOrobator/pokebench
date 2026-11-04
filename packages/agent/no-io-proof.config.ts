import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test-support/no-io-guard.proof.ts"],
    setupFiles: ["test-support/no-io.ts"],
  },
});
