import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unseenState, CURRENT_VERSION, type UnseenState } from "./version";

// Reads/writes the per-user "which release have you already been shown" marker.
//
// FAIL-OPEN, deliberately. The backing column arrives with migration
// 20260805090000_profile_last_seen_version.sql, and this codebase's rule is that
// an unapplied migration degrades a feature rather than 500-ing the page it sits
// on (docs/BUSINESS-LOGIC.md). This runs inside the dashboard LAYOUT, so a throw
// here would take down every authenticated page in the product — for a popup.
// Any error therefore resolves to "caught up": no dot, no dialog, nothing broken.

const CAUGHT_UP: UnseenState = { hasUnseen: false, shouldSpotlight: false, release: null };

export async function getUnseenState(
  supabase: SupabaseClient,
  userId: string
): Promise<UnseenState> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("last_seen_version, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return CAUGHT_UP;

    return unseenState({
      lastSeenVersion: (data.last_seen_version as string | null) ?? null,
      accountCreatedAt: (data.created_at as string | null) ?? null,
    });
  } catch {
    return CAUGHT_UP;
  }
}

/**
 * Marks the current release acknowledged. Returns false when it couldn't be
 * stored (column not there yet, RLS, offline) so the caller can decide — the
 * dialog closes either way, it just reappears on the next full page load rather
 * than pretending a write happened.
 */
export async function markReleaseSeen(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ last_seen_version: CURRENT_VERSION })
      .eq("id", userId);
    return !error;
  } catch {
    return false;
  }
}
