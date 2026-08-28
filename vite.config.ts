import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    host: true,
    // A throwaway Chrome profile lives under .scratch during playtests;
    // Chrome's lock-file churn hit the watcher with EBUSY and killed the dev
    // server mid-run, twice. The game never reads that tree.
    watch: { ignored: ["**/.scratch/**"] },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
