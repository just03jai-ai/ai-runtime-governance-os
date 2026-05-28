import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./artifacts/playwright",
  timeout: 30_000,
  use: {
    baseURL: process.env.TARGET_URL ?? "https://example.com",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          width: 1366,
          height: 768,
        },
      },
    },
  ],
});
