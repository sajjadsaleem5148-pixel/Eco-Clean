import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

// Integration tests run against a local in-memory MongoDB replica set, never against Atlas.
export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.js"],
    globalSetup: ["./tests/integration/globalSetup.js"],
    testTimeout: 60000,
    hookTimeout: 300000,
    fileParallelism: false,
  },
});
