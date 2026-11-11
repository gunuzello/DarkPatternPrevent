import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 60_000,
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
