import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/e2e/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
