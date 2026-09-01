import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Report timestamps are rendered in local time, so the assertions about
    // them need a fixed zone rather than the one the runner happens to be in.
    env: { TZ: "Europe/Warsaw" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
