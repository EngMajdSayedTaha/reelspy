// Fixed-window throttle for UNAUTHENTICATED endpoints.
//
// The signed-in limiter (lib/utils/user-rate-limit.ts) keys on a user id, which
// a public form doesn't have. This wraps the consume_anon_action RPC (see
// 20260806120000_waitlist.sql) and keys on an opaque bucket string instead —
// in practice a salted hash of the client IP, never the IP itself.
//
// Fails OPEN, exactly like the user limiter: an unprovisioned RPC (migration
// not applied yet) must degrade to "no throttle", not to "the form is broken".
// The endpoints behind it are cheap and idempotent, so the worst case of a
// missing limiter is duplicate rows the unique index already collapses.

import type { SupabaseClient } from "@supabase/supabase-js";
import { numEnv } from "@/lib/utils/env";

export type AnonActionLimit = { limit: number; windowSeconds: number };

export const ANON_ACTION_LIMITS: Record<string, AnonActionLimit> = {
  // Joining the waiting list. Generous enough that a household or an office
  // behind one NAT can all sign up, tight enough that a script can't stuff the
  // review queue with thousands of throwaway addresses.
  waitlist_join: {
    limit: numEnv("RL_WAITLIST_JOIN_PER_HOUR", 8),
    windowSeconds: 3600,
  },
};

export type AnonActionResult = { allowed: boolean; retryAfterSeconds: number };

export async function consumeAnonAction(
  admin: SupabaseClient,
  bucket: string,
  action: keyof typeof ANON_ACTION_LIMITS
): Promise<AnonActionResult> {
  const { limit, windowSeconds } = ANON_ACTION_LIMITS[action];

  try {
    const { data, error } = await admin.rpc("consume_anon_action", {
      p_bucket: bucket,
      p_action: action,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.warn(`[anon-rate-limit] consume_anon_action(${action}) failed; allowing:`, error.message);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      return { allowed: false, retryAfterSeconds: row.retry_after_seconds ?? windowSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.warn(`[anon-rate-limit] ${action} threw; allowing:`, err instanceof Error ? err.message : err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
