// The YouTube comment-processing pipeline, used by the polling cron
// (app/api/cron/poll-youtube-comments). Mirrors lib/auto-reply/processor.ts
// (the Instagram side) so behaviour and logging stay consistent — but it is
// comments-only (YouTube has no DMs) and there is no "like" step.
//
// Idempotency: the FIRST thing written for a matched comment is an insert into
// youtube_automation_events, whose comment_id is UNIQUE. A duplicate insert
// (overlapping poll runs, retries) fails with 23505 and the pipeline stops —
// the insert IS the lock, so a comment can never be double-replied.

import type { SupabaseClient } from "@supabase/supabase-js";
import { markConnectionInvalid } from "@/lib/publishing/token-store";
import { matchKeyword } from "./keyword-match";
import { replyToComment, YouTubeApiError } from "./youtube-calls";
import type { YouTubeAutomation, YouTubeComment } from "./types";

export type YouTubeProcessResult =
  | "processed"
  | "duplicate"
  | "skipped_owner"
  | "skipped_no_match"
  | "skipped_locked"
  | "skipped_invalid";

const UNIQUE_VIOLATION = "23505";

function pickTemplate(templates: string[]): string {
  const usable = templates.filter((t) => t.trim());
  if (usable.length === 0) return "Check the description for the link 👇";
  return usable[Math.floor(Math.random() * usable.length)];
}

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 500);
}

export async function processYouTubeComment(
  admin: SupabaseClient,
  automation: YouTubeAutomation,
  comment: YouTubeComment,
  accessToken: string,
  channelId: string | null
): Promise<YouTubeProcessResult> {
  if (!comment.id) return "skipped_invalid";

  // Echo-loop guard: never react to the channel owner's own comments (which
  // includes the bot's own replies).
  if (channelId && comment.authorChannelId && comment.authorChannelId === channelId) {
    return "skipped_owner";
  }

  const matched = matchKeyword(comment.text, automation.keywords, automation.match_mode);
  if (!matched) return "skipped_no_match";

  // Replies disabled / thread locked — nothing we can post.
  if (!comment.canReply) return "skipped_locked";

  // Dedupe-as-lock: claim the comment before sending anything.
  const { error: insertError } = await admin.from("youtube_automation_events").insert({
    user_id: automation.user_id,
    automation_id: automation.id,
    comment_id: comment.id,
    video_id: automation.video_id,
    comment_text: comment.text?.slice(0, 500) ?? null,
    commenter_name: comment.authorName ?? null,
    matched_keyword: matched,
  });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) return "duplicate";
    throw new Error(insertError.message);
  }

  const update: Record<string, unknown> = { processed_at: new Date().toISOString() };

  try {
    const template = pickTemplate(automation.public_reply_templates);
    await replyToComment(comment.id, template, accessToken);
    update.reply_status = "sent";
  } catch (err) {
    update.reply_status = "failed";
    update.reply_error = errorText(err);
    // A revoked token / missing force-ssl scope flags the connection so the UI
    // can prompt a reconnect, mirroring the IG ig_token_status === "invalid" flow.
    if (err instanceof YouTubeApiError && err.isAuthError && automation.connection_id) {
      await markConnectionInvalid(admin, automation.connection_id).catch(() => {});
    }
  }

  const { error: updateError } = await admin
    .from("youtube_automation_events")
    .update(update)
    .eq("comment_id", comment.id);

  if (updateError) {
    console.error("Failed to record YouTube automation event result", updateError);
  }

  return "processed";
}
