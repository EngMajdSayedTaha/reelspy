import { test, expect, confirmDialog, whenInteractive } from "./support/fixtures";

// MONEY PATH 2 — paying.
//
// These run against Stripe in TEST mode. The suite deliberately stops at
// Stripe's hosted checkout: it asserts the customer arrives there, on the right
// plan, having been told the price first. It never enters card details.
//
// Plan cards are located by their name inside the shadcn card wrapper. They have
// no heading element to target — see the note in e2e/README.md.
const planCard = (page: import("@playwright/test").Page, name: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: name }).first();

// The plan buttons are never disabled, so a click that lands before hydration
// does nothing at all. Retry until the confirmation actually opens.
const openPlanDialog = async (page: import("@playwright/test").Page, plan: string) => {
  const dialog = page.getByRole("alertdialog");
  await whenInteractive(async () => {
    await planCard(page, plan).getByRole("button", { name: "Upgrade" }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  });
  return dialog;
};

test.describe("billing", () => {
  test("a free account sees its plan, its usage, and what upgrading costs", async ({ signedIn }) => {
    await signedIn.goto("/dashboard/billing");

    await expect(signedIn.getByRole("heading", { name: "Billing & plan" })).toBeVisible();
    await expect(signedIn.getByText("You're on the free plan. Upgrade any time to raise your limits.")).toBeVisible();

    // The free tier tracks 3 accounts — the number the upgrade prompt hangs on.
    // Scoped to the usage card: "tracked accounts" also appears in every plan's
    // feature list further down the page.
    const usage = signedIn.locator('[data-tour="plan-usage"]');
    await expect(usage.getByText("Tracked accounts", { exact: true })).toBeVisible();
    await expect(usage.getByText("0 / 3")).toBeVisible();

    const creator = planCard(signedIn, "Creator");
    await expect(creator).toBeVisible();
    await expect(creator.getByRole("button", { name: "Upgrade" })).toBeEnabled();
  });

  test("nothing is charged on a single click — the price is confirmed first", async ({ signedIn }) => {
    await signedIn.goto("/dashboard/billing");

    const dialog = await openPlanDialog(signedIn, "Creator");
    await expect(dialog).toContainText("Creator");
    await expect(dialog).toContainText("Nothing is charged until you finish checkout.");

    // Backing out must leave the customer exactly where they were.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(signedIn).toHaveURL(/\/dashboard\/billing/);
    await expect(signedIn.getByText("You're on the free plan. Upgrade any time to raise your limits.")).toBeVisible();
  });

  test("confirming hands the customer to Stripe Checkout", async ({ signedIn }) => {
    await signedIn.goto("/dashboard/billing");

    await openPlanDialog(signedIn, "Creator");
    await confirmDialog(signedIn, "Continue to checkout");

    // Stops here on purpose: reaching Stripe's hosted page is the boundary this
    // suite verifies. Card entry is Stripe's own surface, not ours.
    await signedIn.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
    expect(signedIn.url()).toContain("checkout.stripe.com");
  });

  // UNHAPPY PATH — network failure. The checkout call dies; the customer must be
  // told, and must not be left on a dead spinner.
  test("a failed checkout call surfaces an error instead of hanging", async ({ signedIn }) => {
    await signedIn.route("**/api/billing/checkout", (route) => route.abort("failed"));

    await signedIn.goto("/dashboard/billing");
    await openPlanDialog(signedIn, "Creator");
    await confirmDialog(signedIn, "Continue to checkout");

    await expect(signedIn.getByText("Something went wrong. Please try again.")).toBeVisible();
    await expect(signedIn).toHaveURL(/\/dashboard\/billing/);
    // The button is usable again — no permanently disabled control.
    await expect(planCard(signedIn, "Creator").getByRole("button", { name: "Upgrade" })).toBeEnabled();
  });
});
