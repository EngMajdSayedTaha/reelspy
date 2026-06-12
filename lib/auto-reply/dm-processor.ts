// DM keyword automation pipeline — the direct-message counterpart of
// processor.ts. Same guarantees: the unique message_id insert is the
// idempotency lock, echo/self messages are filtered so the bot can never
// answer itself, and story replies are deliberately skipped (out of scope).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isInvalidTokenError,
  isMetaRateLimitMessage,
  parseGraphError,
} from "@/lib/instagram/graph-api";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { getPageCredentials } from "@/lib/instagram/token-store";
import { matchKeyword } from "./keyword-match";
import { getIgUsernameById, sendDirectMessage } from "./graph-calls";
import type { DmAutomation, MessagingWebhookEvent } from "./types";

export type DmProcessResult =
  | "processed"
  | "duplicate"
  | "skipped_echo"
  | "skipped_story_reply"
  | "skipped_no_automation"
  | "skipped_no_match"
  | "skipped_cooldown"
  | "skipped_invalid";

const UNIQUE_VIOLATION = "23505";

// 'any'-mode only: don't answer the same person more than once per day, or a
// normal back-and-forth conversation would get a bot reply on every message.
const ANY_MODE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return (parseGraphError(message) ?? message).slice(0, 500);
}

export async function processDirectMessage(
  admin: SupabaseClient,
  igAccountId: string,
  event: MessagingWebhookEvent
): Promise<DmProcessResult> {
  const message = event.message;
  const senderId = event.sender?.id;
  if (!message?.mid || !senderId) return "skipped_invalid";

  // Echo events are the connected account's own outgoing messages — including
  // the bot's replies. Skipping them is what prevents reply loops.
  if (message.is_echo) return "skipped_echo";
  if (senderId === igAccountId) return "skipped_echo";

  // Story replies arrive as DMs with reply_to.story — explicitly out of scope.
  if (message.reply_to?.story) return "skipped_story_reply";

  const text = message.text?.trim();
  if (!text) return "skipped_no_match";

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, ig_user_id")
    .eq("ig_user_id", igAccountId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) return "skipped_no_automation";

  const { data: automations, error: automationError } = await admin
    .from("dm_automations")
    .select("*")
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (automationError) throw new Error(automationError.message);

  // First automation (oldest first) whose keywords match wins, so specific
  // keyword automations created before an 'any' catch-all keep priority.
  let matched: { automation: DmAutomation; keyword: string } | null = null;
  for (const automation of (automations ?? []) as DmAutomation[]) {
    const keyword = matchKeyword(text, automation.keywords, automation.match_mode);
    if (keyword) {
      matched = { automation, keyword };
      break;
    }
  }
  if (!matched) return "skipped_no_match";

  if (matched.automation.match_mode === "any") {
    const since = new Date(Date.now() - ANY_MODE_COOLDOWN_MS).toISOString();
    const { data: recent } = await admin
      .from("dm_automation_events")
      .select("id")
      .eq("user_id", profile.id)
      .eq("sender_id", senderId)
      .eq("reply_status", "sent")
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) return "skipped_cooldown";
  }

  // Dedupe-as-lock: claim the message before sending anything.
  const { error: insertError } = await admin.from("dm_automation_events").insert({
    user_id: profile.id,
    automation_id: matched.automation.id,
    message_id: message.mid,
    sender_id: senderId,
    message_text: text.slice(0, 500),
    matched_keyword: matched.keyword,
  });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) return "duplicate";
    throw new Error(insertError.message);
  }

  const update: Record<string, unknown> = {};
  const page = await getPageCredentials(admin, profile.id).catch(() => null);

  if (page) {
    try {
      const reply = matched.automation.reply_link
        ? `${matched.automation.reply_message}\n\n${matched.automation.reply_link}`
        : matched.automation.reply_message;
      await sendDirectMessage(page.pageId, senderId, reply, page.pageToken);
      update.reply_status = "sent";
    } catch (err) {
      update.reply_status = "failed";
      update.reply_error = errorText(err);
      const raw = err instanceof Error ? err.message : String(err);
      if (isMetaRateLimitMessage(raw)) {
        await createMetaRateLimiter(admin, profile.id)
          .recordThrottle()
          .catch(() => {});
      }
      if (isInvalidTokenError(raw)) {
        await admin.from("profiles").update({ ig_token_status: "invalid" }).eq("id", profile.id);
      }
    }

    // Username is cosmetic (event log only) — never let it fail the pipeline.
    update.sender_username = await getIgUsernameById(senderId, page.pageToken);
  } else {
    update.reply_status = "failed";
    update.reply_error = "No Facebook Page credentials — reconnect Instagram in Settings.";
  }

  update.processed_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("dm_automation_events")
    .update(update)
    .eq("message_id", message.mid);

  if (updateError) {
    console.error("Failed to record dm automation event result", updateError);
  }

  return "processed";
}
