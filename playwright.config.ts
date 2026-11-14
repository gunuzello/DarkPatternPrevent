import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const directory = process.env.PLAYWRIGHT_RUN_DIRECTORY ?? mkdtempSync(join(tmpdir(), "darkpattern-test-"));
process.env.PLAYWRIGHT_RUN_DIRECTORY = directory;
process.env.DATABASE_URL = "file:" + join(directory, "test.db");
process.env.SCAN_RESULTS_DIR = join(directory, "scans");
process.env.DEMO_ORIGIN = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests",
  globalTeardown: "./tests/cleanup.ts",
  workers: 1,
  use: { channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: {
    command: "npm run db:setup && npm run dev -- --port 3100",
    url: process.env.DEMO_ORIGIN,
    timeout: 60_000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      DEMO_ORIGIN: process.env.DEMO_ORIGIN,
      DATABASE_URL: process.env.DATABASE_URL,
      SCAN_RESULTS_DIR: process.env.SCAN_RESULTS_DIR,
      PLAYWRIGHT_RUN_DIRECTORY: process.env.PLAYWRIGHT_RUN_DIRECTORY,
    },
  },
});
