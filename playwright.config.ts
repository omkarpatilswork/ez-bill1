import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the local dev server (vite, port 8080).
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:8080", trace: "off" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: true,
  },
});
