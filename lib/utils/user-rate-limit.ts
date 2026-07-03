// Per-user, per-action throttle for expensive endpoints (AI, transcription).
//
// Wraps the consume_user_action RPC (see
// supabase/migrations/20260626c_user_action_rate_limit.sql). Fails OPEN: if the
// RPC isn't provisioned yet (migration not applied) we allow the call rather
// than hard-blocking a feature on the limiter's own infrastructure — same
// posture as the Meta rate limiter.

import type { SupabaseClient } from "@supabase/supabase-js";
import { numEnv } from "@/lib/utils/env";

export type UserActionLimit = { limit: number; windowSeconds: number };

// Defaults are deliberately generous for real use but low enough to stop a loop
// from burning quota. Tunable per-deploy via env.
export const USER_ACTION_LIMITS: Record<string, UserActionLimit> = {
  generate_script: {
    limit: numEnv("RL_GENERATE_SCRIPT_PER_HOUR", 30),
    windowSeconds: 3600,
  },
  growth_notes: {
    limit: numEnv("RL_GROWTH_NOTES_PER_HOUR", 10),
    windowSeconds: 3600,
  },
  transcript: {
    limit: numEnv("RL_TRANSCRIPT_PER_HOUR", 20),
    windowSeconds: 3600,
  },
  // Cheap to serve (just mints a presigned URL) but each one authorizes an
  // unbounded upload to R2, so cap how many a single user can request per hour.
  upload_presign: {
    limit: numEnv("RL_UPLOAD_PRESIGN_PER_HOUR", 60),
    windowSeconds: 3600,
  },
};

export type UserActionResult = { allowed: boolean; retryAfterSeconds: number };

export async function consumeUserAction(
  supabase: SupabaseClient,
  userId: string,
  action: keyof typeof USER_ACTION_LIMITS
): Promise<UserActionResult> {
  const { limit, windowSeconds } = USER_ACTION_LIMITS[action];

  const { data, error } = await supabase.rpc("consume_user_action", {
    p_user_id: userId,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.warn(`[user-rate-limit] consume_user_action(${action}) failed; allowing:`, error.message);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    return { allowed: false, retryAfterSeconds: row.retry_after_seconds ?? windowSeconds };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

// Build a friendly 429 message for a throttled action.
export function rateLimitMessage(action: keyof typeof USER_ACTION_LIMITS, retryAfterSeconds: number): string {
  const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const label: Record<string, string> = {
    generate_script: "generate scripts",
    growth_notes: "generate growth notes",
    transcript: "request transcripts",
    upload_presign: "upload videos",
  };
  return `You're doing that a lot. You can ${label[action] ?? "do that"} again in about ${mins} min.`;
}
