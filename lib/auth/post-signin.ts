// Shared post-authentication bookkeeping: ensure the profile row exists and
// record the signup funnel event on first session. Used by both the Google
// OAuth callback (/auth/callback) and the email token-hash confirm route
// (/auth/confirm) so the two entry points can't drift.

import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { track } from "@/lib/analytics/track";

export type PostSignInError =
  | { code: "schema_missing"; message: string }
  | { code: "profile_upsert_failed"; message: string };

export async function completePostSignIn(
  supabase: SupabaseClient,
  user: User
): Promise<PostSignInError | null> {
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: user.email,
    },
    // Insert-or-ignore: we only need the row to EXIST so other tables can FK to
    // it. Using ignoreDuplicates emits `ON CONFLICT DO NOTHING`, which requires
    // only the INSERT(id, username) privilege granted to `authenticated`. A
    // merge upsert would emit `DO UPDATE SET id=…`, and Postgres checks UPDATE
    // privilege on every SET column at plan time — but `id` has no UPDATE grant
    // (see 20260611_lock_down_ig_tokens.sql), so it fails with
    // "permission denied for table profiles" for every user, new or returning.
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (profileError) {
    console.error("Profile upsert failed", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
    });

    if (profileError.code === "PGRST205") {
      return { code: "schema_missing", message: profileError.message };
    }
    return { code: "profile_upsert_failed", message: profileError.message };
  }

  // Instrumentation (L5): first session ≈ signup (funnel head). user.created_at
  // is stamped at account creation, so a recent value marks the very first
  // sign-in; the funnel views take min(created_at), so a rare duplicate is safe.
  const createdAt = user.created_at ? Date.parse(user.created_at) : NaN;
  if (Number.isFinite(createdAt) && Date.now() - createdAt < 2 * 60_000) {
    await track(user.id, "signed_up");
  }

  return null;
}
