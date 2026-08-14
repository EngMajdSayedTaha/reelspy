import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// E2E secrets come from the same files the app uses. `.env.e2e` wins when it
// exists, so pointing the suite at a throwaway Supabase project later is a file
// drop, not a code change. Node's own loader — no dotenv dependency.
for (const file of [".env.local", ".env.e2e"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
// `localhost`, NOT 127.0.0.1. Next 16 refuses to serve dev resources
// cross-origin, and it considers those two different origins — hitting the
// server on 127.0.0.1 gets the HTML but none of the client chunks, so the page
// renders and then never hydrates. Every form on the site looks permanently
// disabled. Matching the origin the dev server prints avoids having to loosen
// `allowedDevOrigins` in next.config.ts for a test-only concern.
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Every spec seeds its own user and cleans up after itself, so files can run
  // together. Workers are capped low on purpose: this suite talks to a real
  // Supabase project and a real (test-mode) Stripe account, and hammering
  // either buys nothing.
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    // Artifacts on failure only — a green run leaves nothing behind.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    locale: "en-US",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Headless everywhere by default; `npm run e2e:headed` flips it locally.
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
