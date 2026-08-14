import { test, expect, whenInteractive } from "./support/fixtures";
import { seedInspirationAccounts } from "./support/admin";

// MONEY PATH 3 — the core loop's first step: tracking inspiration accounts.
//
// The happy path ends at Instagram: addInspirationAccount validates the handle
// through Meta's Business Discovery API server-side, so a headless run can't
// complete it. What IS fully testable is every gate in front of that call — and
// those gates are where the money is: the plan cap is the upgrade trigger, and
// the "connect Instagram" guard is the onboarding cliff.
//
// Order of checks in app/dashboard/accounts/actions.ts, which is what these
// tests pin: empty → malformed → plan cap → Instagram connection.

// The trigger is never disabled, so a pre-hydration click is silently swallowed
// — retry until the dialog actually opens.
const openAddDialog = async (page: import("@playwright/test").Page) => {
  const dialog = page.getByRole("dialog");
  await whenInteractive(async () => {
    await page.getByRole("button", { name: "Add Account" }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  });
  return dialog;
};

test.describe("tracking accounts", () => {
  test("a new account starts empty and invites the first add", async ({ signedIn }) => {
    await signedIn.goto("/dashboard/accounts");

    await expect(signedIn.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await expect(
      signedIn.getByText("No inspiration accounts yet. Add your first account above.")
    ).toBeVisible();
  });

  test("seeded accounts are listed and searchable", async ({ signedIn, user, admin }) => {
    const [first] = await seedInspirationAccounts(admin, user.id, 2);

    await signedIn.goto("/dashboard/accounts");
    await expect(signedIn.getByText(first!, { exact: false })).toBeVisible();

    // The search is a submitted form, not a live filter — typing alone changes
    // nothing until Enter (or the Search button) navigates with ?q=.
    await whenInteractive(async () => {
      const box = signedIn.getByPlaceholder("Search accounts…");
      await box.fill("definitely_not_a_real_handle");
      await box.press("Enter");
      await expect(signedIn.getByText(/No accounts match/)).toBeVisible({ timeout: 5_000 });
    });
  });

  // UNHAPPY PATH — bad input, caught before anything leaves the browser.
  test("an empty handle is refused", async ({ signedIn }) => {
    await signedIn.goto("/dashboard/accounts");
    const dialog = await openAddDialog(signedIn);

    await dialog.getByRole("button", { name: "Add Account" }).click();
    await expect(dialog.getByText("Instagram username is required.")).toBeVisible();
  });

  test("a malformed handle is refused before any Instagram quota is spent", async ({ signedIn }) => {
    await signedIn.goto("/dashboard/accounts");
    const dialog = await openAddDialog(signedIn);

    await dialog.getByLabel("Instagram Username").fill("not a valid handle!");
    await dialog.getByRole("button", { name: "Add Account" }).click();

    await expect(
      dialog.getByText("Usernames can only contain letters, numbers, dots and underscores (max 30).")
    ).toBeVisible();
  });

  test("a well-formed handle asks the user to connect Instagram first", async ({ signedIn }) => {
    await signedIn.goto("/dashboard/accounts");
    const dialog = await openAddDialog(signedIn);

    await dialog.getByLabel("Instagram Username").fill("natgeo");
    await dialog.getByRole("button", { name: "Add Account" }).click();

    await expect(
      dialog.getByText(
        "Connect your Instagram account first (Settings → Instagram) before adding inspiration accounts."
      )
    ).toBeVisible({ timeout: 20_000 });
  });

  // The upgrade trigger. A free account tracks 3; the 4th must name the plan,
  // the cap, and where to fix it.
  test("the free plan's 3-account cap is enforced and explained", async ({
    signedIn,
    user,
    admin,
  }) => {
    await seedInspirationAccounts(admin, user.id, 3);

    await signedIn.goto("/dashboard/accounts");
    const dialog = await openAddDialog(signedIn);

    await dialog.getByLabel("Instagram Username").fill("natgeo");
    await dialog.getByRole("button", { name: "Add Account" }).click();

    await expect(dialog.getByText(/tracks up to 3 accounts/)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/Upgrade in Billing to add more\./)).toBeVisible();
  });

  // UNHAPPY PATH — expired session. The gate is in middleware, so it must hold
  // on the very next navigation, not just on a fresh load.
  test("an expired session sends the user back to sign in", async ({ signedIn }) => {
    await signedIn.goto("/dashboard/accounts");
    await expect(signedIn.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();

    await signedIn.context().clearCookies();

    await signedIn.goto("/dashboard/accounts");
    await expect(signedIn).toHaveURL(/\/login/);
    await expect(signedIn.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});
