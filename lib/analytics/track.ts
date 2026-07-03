// Server-side event + AI-usage logging (L5 / §5). Fire-and-forget: everything
// here is wrapped so instrumentation can NEVER break the request path — a
// missing service-role key, an unmigrated table, or a transient DB error is
// swallowed with a warning. Both tables are service-role only, so this uses the
// admin client internally; call sites just pass userId/event/props.

import { createAdminClient } from "@/lib/supabase/admin";

export type TrackProps = Record<string, unknown>;

export async function track(userId: string, event: string, props: TrackProps = {}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_events").insert({ user_id: userId, event, props });
    if (error) console.warn(`[track] ${event} insert failed:`, error.message);
  } catch (err) {
    console.warn(`[track] ${event} threw:`, err instanceof Error ? err.message : err);
  }
}

export type AiUsageRow = {
  action: string; // 'script' | 'growth_notes'
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

export async function trackAiUsage(userId: string, usage: AiUsageRow): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_usage").insert({
      user_id: userId,
      action: usage.action,
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.inputTokens ?? null,
      output_tokens: usage.outputTokens ?? null,
    });
    if (error) console.warn("[track] ai_usage insert failed:", error.message);
  } catch (err) {
    console.warn("[track] ai_usage threw:", err instanceof Error ? err.message : err);
  }
}
