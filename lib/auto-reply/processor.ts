// The comment-processing pipeline shared by the webhook route AND the polling
// fallback cron, so both paths behave identically and stay idempotent.
//
// Idempotency: the FIRST thing written for a matched comment is an insert into
// automation_events, whose comment_id is UNIQUE. A duplicate insert (webhook
// retry, webhook + polling overlap, concurrent invocations) fails with 23505
// and the pipeline stops — the insert IS the lock, so a comment can never be
// double-replied or double-DMed.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isInvalidTokenError,
  isMetaRateLimitMessage,
  parseGraphError,
} from "@/lib/instagram/graph-api";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { getIgCredentials, getPageCredentials } from "@/lib/instagram/token-store";
import { matchKeyword } from "./keyword-match";
import { replyToComment, sendPrivateReply } from "./graph-calls";
import type { CommentWebhookValue, ReelAutomation } from "./types";

export type ProcessResult =
  | "processed"
  | "duplicate"
  | "skipped_echo"
  | "skipped_no_automation"
  | "skipped_no_match"
  | "skipped_invalid";

const UNIQUE_VIOLATION = "23505";

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // Prefer Meta's user-facing message; never persist the raw body (it can
  // include internal request metadata).
  return (parseGraphError(message) ?? message).slice(0, 500);
}

function pickTemplate(templates: string[]): string {
  const usable = templates.filter((t) => t.trim());
  if (usable.length === 0) return "Check your DMs 📩";
  return usable[Math.floor(Math.random() * usable.length)];
}

// Replies deliberately bypass the shared limiter's acquire(): a tripped circuit
// (from reel syncing) silently dropping a time-sensitive DM is worse than the
// negligible quota cost of low-volume comment replies. Throttle signals still
// feed the circuit breaker so syncs back off.
async function handleGraphFailure(
  admin: SupabaseClient,
  userId: string,
  err: unknown
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  if (isMetaRateLimitMessage(message)) {
    await createMetaRateLimiter(admin, userId)
      .recordThrottle()
      .catch(() => {});
  }
  if (isInvalidTokenError(message)) {
    // Existing Settings UI watches this flag and prompts a reconnect.
    await admin.from("profiles").update({ ig_token_status: "invalid" }).eq("id", userId);
  }
}

export async function processCommentChange(
  admin: SupabaseClient,
  igAccountId: string,
  value: CommentWebhookValue
): Promise<ProcessResult> {
  if (!value?.id) return "skipped_invalid";

  // Replies to comments are out of scope — and skipping them is also the
  // second line of defence against the bot's own public reply re-triggering
  // the webhook (echo loop).
  if (value.parent_id) return "skipped_echo";

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, ig_user_id")
    .eq("ig_user_id", igAccountId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) return "skipped_no_automation";

  // Echo-loop filter, first line: never react to the account's own comments.
  if (value.from?.id && value.from.id === profile.ig_user_id) return "skipped_echo";

  const mediaId = value.media?.id;
  if (!mediaId) return "skipped_invalid";

  const { data: automation, error: automationError } = await admin
    .from("reel_automations")
    .select("*")
    .eq("user_id", profile.id)
    .eq("ig_media_id", mediaId)
    .eq("is_active", true)
    .maybeSingle<ReelAutomation>();

  if (automationError) throw new Error(automationError.message);
  if (!automation) return "skipped_no_automation";

  const matched = matchKeyword(value.text, automation.keywords, automation.match_mode);
  if (!matched) return "skipped_no_match";

  // Dedupe-as-lock: claim the comment before sending anything.
  const { error: insertError } = await admin.from("automation_events").insert({
    user_id: profile.id,
    automation_id: automation.id,
    comment_id: value.id,
    ig_media_id: mediaId,
    comment_text: value.text?.slice(0, 500) ?? null,
    commenter_id: value.from?.id ?? null,
    commenter_username: value.from?.username ?? null,
    matched_keyword: matched,
  });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) return "duplicate";
    throw new Error(insertError.message);
  }

  const update: Record<string, unknown> = {};

  const credentials = await getIgCredentials(admin, profile.id).catch(() => null);

  // Step 1 — public reply (user token). A failure here does NOT block the DM —
  // the DM is the point of the feature.
  if (credentials) {
    try {
      const template = pickTemplate(automation.public_reply_templates);
      await replyToComment(value.id, template, credentials.token);
      update.public_reply_status = "sent";
    } catch (err) {
      update.public_reply_status = "failed";
      update.public_reply_error = errorText(err);
      await handleGraphFailure(admin, profile.id, err);
    }
  } else {
    update.public_reply_status = "skipped";
    update.public_reply_error = "Instagram not connected.";
  }

  // Step 2 — private reply DM (page token).
  const page = await getPageCredentials(admin, profile.id).catch(() => null);
  if (page) {
    try {
      const text = automation.dm_link
        ? `${automation.dm_message}\n\n${automation.dm_link}`
        : automation.dm_message;
      await sendPrivateReply(page.pageId, value.id, text, page.pageToken);
      update.dm_status = "sent";
    } catch (err) {
      update.dm_status = "failed";
      update.dm_error = errorText(err);
      await handleGraphFailure(admin, profile.id, err);
    }
  } else {
    update.dm_status = "failed";
    update.dm_error = "No Facebook Page credentials — reconnect Instagram in Settings.";
  }

  update.processed_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("automation_events")
    .update(update)
    .eq("comment_id", value.id);

  if (updateError) {
    console.error("Failed to record automation event result", updateError);
  }

  return "processed";
}
