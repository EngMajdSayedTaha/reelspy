import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  purgeEmail,
  testEmail,
  type TestUser,
} from "./admin";

// Fixtures. Each test gets its OWN account, created before it runs and hard-
// deleted after — so specs can run in any order, in parallel, with nothing
// shared between them.

type Fixtures = {
  /** Service-role client, for seeding and asserting on server state. */
  admin: SupabaseClient;
  /** A fresh, confirmed, waitlist-approved account. Deleted in teardown. */
  user: TestUser;
  /**
   * An unused address for tests that drive signup themselves. Whatever the test
   * leaves behind under it — a waitlist row, an account, or both — is removed in
   * teardown, which is the point: cleanup written at the end of a test body is
   * skipped the moment that test fails, and those leaks are exactly what you
   * don't notice until the table is full of them.
   */
  applicantEmail: string;
  /** A page already signed in as `user`, sitting on /dashboard. */
  signedIn: Page;
};

export const test = base.extend<Fixtures>({
  admin: async ({}, use) => {
    await use(adminClient());
  },

  user: async ({ admin }, use) => {
    const user = await createTestUser(admin);
    await use(user);
    await deleteTestUser(admin, user);
  },

  applicantEmail: async ({ admin }, use) => {
    const email = testEmail();
    await use(email);
    await purgeEmail(admin, email);
  },

  // The cookie banner is a fixed bottom bar that overlaps page controls. Answer
  // it up front — declining, which is the privacy-preserving choice and also
  // what keeps Clarity's session recorder out of test runs.
  page: async ({ page, baseURL }, use) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("reelspy:cookie-consent", "rejected");
      } catch {
        // Storage can be unavailable before the first navigation; the cookie
        // below is enough on its own.
      }
    });
    if (baseURL) {
      await page.context().addCookies([
        { name: "cookie_consent", value: "rejected", url: baseURL },
      ]);
    }
    await use(page);
  },

  signedIn: async ({ page, user }, use) => {
    await signIn(page, user);
    await use(page);
  },
});

/**
 * Fill a form and wait until the app has actually received the values.
 *
 * Next renders these forms on the server and hydrates them a moment later.
 * Before hydration React holds no state, so a value typed into a field sits in
 * the DOM while the component still believes it is empty — and the submit button
 * keeps the `disabled` it was server-rendered with. Retrying the fills until
 * that button reports ready is what makes the suite deterministic instead of
 * racing the dev server's compile time.
 *
 * The button is the app's own readiness signal, which is the point: no arbitrary
 * sleeps, and no assertion on a framework internal.
 */
export async function fillForm(fill: () => Promise<void>, submit: Locator): Promise<void> {
  await expect(async () => {
    await fill();
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000, intervals: [200, 500, 1_000] });
}

/**
 * Retry an interaction that needs client-side JS until it takes effect — for
 * controls that are never disabled, where the only proof hydration has happened
 * is that clicking them did something.
 */
export async function whenInteractive(action: () => Promise<void>): Promise<void> {
  await expect(action).toPass({ timeout: 30_000, intervals: [200, 500, 1_000] });
}

/** Sign in through the real form — this is the path customers use. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Sign In" });
  await fillForm(async () => {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
  }, submit);
  await submit.click();
  await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 });
}

/** Radix renders confirmations as an alertdialog; this is how you accept one. */
export async function confirmDialog(page: Page, confirmText: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirmText }).click();
}

export { expect };
