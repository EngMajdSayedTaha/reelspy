import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Service-role helpers for E2E seeding + teardown.
//
// The suite runs against a REAL Supabase project, so everything it creates is
// namespaced (`E2E_PREFIX`) and hard-deleted in teardown. Two rules keep that
// honest:
//   1. Nothing here ever touches a row it did not create.
//   2. Every seed helper returns enough to delete itself.
//
// Deleting the auth user cascades to profiles / inspiration_accounts /
// account_groups (FKs are ON DELETE CASCADE), so teardown only has to clean the
// tables keyed by email rather than user_id — waitlist_entries — plus
// subscriptions, which the checkout flow may write before a user row exists.

export const E2E_PREFIX = "e2e+";

/** Namespaced address. `e2e+<uuid>@reelspy.dev` — their own domain, so a stray
 *  transactional send stays in-house and is trivially filterable. */
export function testEmail(): string {
  return `${E2E_PREFIX}${randomUUID()}@reelspy.dev`;
}

/** Satisfies lib/auth/password.ts: 10+ chars, upper, lower, digit, symbol. */
export const TEST_PASSWORD = "E2e!Passw0rd-Suite";

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local or .env.e2e)."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Create a confirmed account that can actually reach the dashboard.
 *
 * `email_confirm: true` skips the emailed 6-digit code — that step is covered
 * on its own in auth.spec.ts, and re-walking it for every test would make the
 * suite depend on an inbox.
 *
 * The approved waitlist row is not optional: the closed-beta gate
 * (lib/waitlist/access.ts) holds any account created after the flag was flipped,
 * so without it every signed-in test would land on /waitlist instead of the
 * product. Pass `approved: false` to exercise the held state deliberately.
 */
export async function createTestUser(
  admin: SupabaseClient,
  { approved = true, onboarded = true }: { approved?: boolean; onboarded?: boolean } = {}
): Promise<TestUser> {
  const email = testEmail();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`E2E: could not create test user: ${error?.message ?? "no user returned"}`);
  }

  if (approved) {
    await approveWaitlist(admin, email, data.user.id);
  }
  if (onboarded) {
    await completeOnboarding(admin, data.user.id);
  }

  return { id: data.user.id, email, password: TEST_PASSWORD };
}

/**
 * Clear the three first-run interrupts that sit on top of a brand-new
 * dashboard: the niche quiz (a modal), the guided tour (a driver.js overlay),
 * and the release spotlight. All three are real product behaviour and all three
 * cover the page a test is trying to assert on, so tests about billing or
 * accounts stamp them done first.
 *
 * The quiz has its own test in auth.spec.ts — that one opts out via
 * `createTestUser(admin, { onboarded: false })` rather than working around this.
 *
 * `last_seen_version` is set absurdly high so no future release can make the
 * spotlight reappear and start failing unrelated specs.
 */
export async function completeOnboarding(admin: SupabaseClient, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("profiles").upsert(
    {
      id: userId,
      quiz_completed_at: now,
      tour_completed_at: now,
      onboarded_at: now,
      last_seen_version: "999.0.0",
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`E2E: could not stamp onboarding: ${error.message}`);
}

/** Put an address on the list as already-approved (idempotent). */
export async function approveWaitlist(
  admin: SupabaseClient,
  email: string,
  userId?: string | null
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await admin
    .from("waitlist_entries")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  const patch = {
    status: "approved" as const,
    approved_at: new Date().toISOString(),
    user_id: userId ?? null,
  };

  if (existing) {
    await admin.from("waitlist_entries").update(patch).eq("id", existing.id);
    return;
  }
  await admin.from("waitlist_entries").insert({ email: normalized, source: "admin", ...patch });
}

/** Remove every row this suite created for one address. Never throws. */
export async function deleteTestUser(admin: SupabaseClient, user: TestUser): Promise<void> {
  await removeWaitlistEntry(admin, user.email);
  try {
    await admin.from("subscriptions").delete().eq("user_id", user.id);
  } catch {
    // The table may not exist on a bare project — teardown must not fail a run.
  }
  try {
    await admin.auth.admin.deleteUser(user.id);
  } catch {
    // Already gone (a test may have deleted it) — nothing to do.
  }
}

/**
 * Look up an account by address.
 *
 * `auth.admin.listUsers()` is paginated and returns the first page only, so on a
 * project with more than a page of users it silently fails to find a brand-new
 * one — and a test that signed up through the UI then leaks its account. GoTrue's
 * admin endpoint takes a filter, which supabase-js doesn't surface, so this goes
 * to the REST API directly.
 */
export async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=200`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
    const match = body.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    return match ? { id: match.id } : null;
  } catch {
    return null;
  }
}

/** Delete whatever exists for one address — account and/or waitlist row. */
export async function purgeEmail(admin: SupabaseClient, email: string): Promise<void> {
  await removeWaitlistEntry(admin, email);
  const existing = await findUserByEmail(email);
  if (existing) {
    await deleteTestUser(admin, { id: existing.id, email, password: TEST_PASSWORD });
  }
}

export async function removeWaitlistEntry(admin: SupabaseClient, email: string): Promise<void> {
  try {
    await admin.from("waitlist_entries").delete().eq("email", email.trim().toLowerCase());
  } catch {
    // best effort
  }
}

/**
 * Seed tracked inspiration accounts straight into the DB.
 *
 * The UI path for this needs a live Instagram connection (Business Discovery
 * validates the handle server-side), which E2E can't complete — so tests that
 * need a populated account list seed it here and assert on what the user sees.
 * Returns the usernames it created.
 */
export async function seedInspirationAccounts(
  admin: SupabaseClient,
  userId: string,
  count: number
): Promise<string[]> {
  const usernames = Array.from({ length: count }, (_, i) => `e2e_seed_${i}_${randomUUID().slice(0, 8)}`);
  const { error } = await admin.from("inspiration_accounts").insert(
    usernames.map((ig_username) => ({
      user_id: userId,
      ig_username,
      display_name: ig_username,
      is_active: true,
    }))
  );
  if (error) throw new Error(`E2E: could not seed inspiration accounts: ${error.message}`);
  return usernames;
}
