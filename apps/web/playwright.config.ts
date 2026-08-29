import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 15_000,
    baseURL: "http://127.0.0.1:5051",
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev -p 5051",
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
    },
    url: "http://127.0.0.1:5051",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
