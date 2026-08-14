import { test, expect, signIn, fillForm } from "./support/fixtures";
import { approveWaitlist, createTestUser, deleteTestUser, TEST_PASSWORD } from "./support/admin";

// MONEY PATH 1 — getting an account.
//
// The waiting list is currently ON, so the funnel has two doors and both are
// covered here:
//   /signup                → join form  → "you're #N in line"
//   /signup?email=approved → real account form → dashboard
//
// Everything asserts on what the visitor sees. Tests that create their own
// applicant take the `applicantEmail` fixture, which purges whatever they leave
// behind even when they fail.

test.describe("signup", () => {
  test("closed beta: /signup collects an email for the waiting list", async ({
    page,
    applicantEmail,
  }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Join the waiting list" })).toBeVisible();

    const join = page.getByRole("button", { name: "Join the waiting list" });
    await fillForm(() => page.getByLabel("Email").fill(applicantEmail), join);
    await join.click();

    // Either wording is a success — "already on the list" is what a repeat
    // submit gets, and the suite must not care which one it hit.
    await expect(
      page.getByRole("heading", { name: /You're (on|already on) the list\./ })
    ).toBeVisible();
  });

  test("an approved applicant gets the real account form, locked to their address", async ({
    page,
    admin,
    applicantEmail,
  }) => {
    await approveWaitlist(admin, applicantEmail);

    await page.goto(`/signup?email=${encodeURIComponent(applicantEmail)}`);

    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    const emailField = page.getByLabel("Email");
    await expect(emailField).toHaveValue(applicantEmail);
    // Locked rather than merely prefilled: signing up under a different address
    // would land them straight back behind the gate.
    await expect(emailField).toHaveAttribute("readonly", /.*/);
  });

  test("creates an account and asks for the emailed verification code", async ({
    page,
    admin,
    applicantEmail,
  }) => {
    await approveWaitlist(admin, applicantEmail);

    await page.goto(`/signup?email=${encodeURIComponent(applicantEmail)}`);
    const signUp = page.getByRole("button", { name: "Sign Up" });
    await fillForm(async () => {
      await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
      await page.getByLabel("Confirm password").fill(TEST_PASSWORD);
    }, signUp);
    await signUp.click();

    await expect(page.getByRole("heading", { name: "Enter your verification code" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(applicantEmail)).toBeVisible();
  });

  // UNHAPPY PATH — bad input. Caught client-side, before Supabase is called.
  test("rejects a weak password without creating anything", async ({
    page,
    admin,
    applicantEmail,
  }) => {
    await approveWaitlist(admin, applicantEmail);

    await page.goto(`/signup?email=${encodeURIComponent(applicantEmail)}`);
    const signUp = page.getByRole("button", { name: "Sign Up" });
    await fillForm(async () => {
      await page.getByLabel("Password", { exact: true }).fill("password");
      await page.getByLabel("Confirm password").fill("password");
    }, signUp);
    await signUp.click();

    await expect(page.getByText(/At least 10 characters\./)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  });

  test("rejects mismatched passwords", async ({ page, admin, applicantEmail }) => {
    await approveWaitlist(admin, applicantEmail);

    await page.goto(`/signup?email=${encodeURIComponent(applicantEmail)}`);
    const signUp = page.getByRole("button", { name: "Sign Up" });
    await fillForm(async () => {
      await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
      await page.getByLabel("Confirm password").fill(`${TEST_PASSWORD}x`);
    }, signUp);
    await signUp.click();

    await expect(page.getByText("Passwords don't match.")).toBeVisible();
  });
});

test.describe("sign in", () => {
  test("an approved account reaches the dashboard", async ({ page, user }) => {
    await signIn(page, user);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // UNHAPPY PATH — bad credentials. The message must not reveal which half was
  // wrong, and the user must stay on the form.
  test("a wrong password is refused without leaking which field failed", async ({ page, user }) => {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Sign In" });
    await fillForm(async () => {
      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Password", { exact: true }).fill("Wrong!Password9");
    }, submit);
    await submit.click();

    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  // The first thing a brand-new account actually sees. This is the only test
  // that opts out of the onboarding stamp the other specs rely on.
  test("a brand-new account is asked for its niche, and can skip", async ({ page, admin }) => {
    const fresh = await createTestUser(admin, { onboarded: false });
    try {
      await signIn(page, fresh);

      const quiz = page.getByRole("dialog", { name: "What's your niche?" });
      await expect(quiz).toBeVisible();
      await expect(quiz.getByText("Step 1 of 4")).toBeVisible();

      await quiz.getByRole("button", { name: "Skip for now" }).click();
      await expect(quiz).toBeHidden();
    } finally {
      await deleteTestUser(admin, fresh);
    }
  });

  // UNHAPPY PATH — a held account. Signing up while the gate is closed gets you
  // an account, but not the product.
  test("an unapproved account is held at the waiting list, not the dashboard", async ({
    page,
    admin,
  }) => {
    const held = await createTestUser(admin, { approved: false });
    try {
      await page.goto("/login");
      const submit = page.getByRole("button", { name: "Sign In" });
      await fillForm(async () => {
        await page.getByLabel("Email").fill(held.email);
        await page.getByLabel("Password", { exact: true }).fill(held.password);
      }, submit);
      await submit.click();

      await page.waitForURL(/\/waitlist/, { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "You're on the list." })).toBeVisible();
    } finally {
      await deleteTestUser(admin, held);
    }
  });
});
