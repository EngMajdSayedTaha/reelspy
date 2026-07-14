// Per-user weekly-digest runner for the durable queue (V4). The weekly-digest
// cron now just fans out one `send_digest` job per opted-in user; this builds and
// sends that one user's digest. Extracted verbatim from the old inline loop so
// behavior is unchanged — only the execution substrate moved to the job queue.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { buildWeeklyDigest, type DigestReel, type DigestHook } from "@/lib/email/weekly-digest";
import { digestUnsubscribeUrl } from "@/lib/email/digest-token";
import { rankRising, risingSinceIso } from "@/lib/reels/ranking";
import { track } from "@/lib/analytics/track";
import { getSiteUrl } from "@/lib/site";

const RISING_LIMIT = 5;
const HOOKS_LIMIT = 3;

export type DigestOutcome = "sent" | "skipped_empty" | "skipped_opted_out" | "skipped_no_email" | "not_configured";

function firstUsername(v: unknown): string {
  if (!v) return "unknown";
  const row = Array.isArray(v) ? v[0] : v;
  return (row as { ig_username?: string })?.ig_username ?? "unknown";
}

// Build + send one user's weekly digest. Re-checks opt-out at send time (the job
// may have been queued minutes earlier). Returns why it did/didn't send.
export async function runSendDigest(
  admin: SupabaseClient,
  userId: string
): Promise<DigestOutcome> {
  if (!emailConfigured()) return "not_configured";

  // Re-verify opt-out at send time.
  const { data: profile } = await admin
    .from("profiles")
    .select("digest_opt_out")
    .eq("id", userId)
    .maybeSingle();
  if ((profile as { digest_opt_out?: boolean } | null)?.digest_opt_out) {
    return "skipped_opted_out";
  }

  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  const to = userRes?.user?.email;
  if (!to) return "skipped_no_email";

  const since = risingSinceIso();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();

  const [risingRes, hooksRes, researchedRes, scriptsRes] = await Promise.all([
    admin
      .from("tracked_reels")
      .select(
        "id, caption, ig_permalink, viral_score, posted_at, inspiration_accounts!inner(ig_username)"
      )
      .eq("user_id", userId)
      .eq("is_discarded", false)
      .eq("is_worked_on", false)
      .eq("inspiration_accounts.is_active", true)
      .gte("posted_at", since)
      .order("posted_at", { ascending: false })
      .limit(300),
    admin
      .from("saved_hooks")
      .select("text, reel_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HOOKS_LIMIT),
    admin
      .from("tracked_reels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", weekAgo),
    admin
      .from("generated_scripts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", weekAgo),
  ]);

  type RisingRow = {
    id: string;
    caption: string | null;
    ig_permalink: string;
    viral_score: number | null;
    posted_at: string | null;
    inspiration_accounts: unknown;
  };
  const candidates = (risingRes.data ?? []) as RisingRow[];
  const risingReels: DigestReel[] = rankRising(candidates, RISING_LIMIT).map((r) => ({
    reelId: r.id,
    username: firstUsername(r.inspiration_accounts),
    caption: r.caption,
    permalink: r.ig_permalink,
    score: Number(r.viral_score ?? 0),
  }));

  const hooks: DigestHook[] = (
    (hooksRes.data ?? []) as { text: string; reel_id: string | null }[]
  ).map((h) => ({ text: h.text, reelId: h.reel_id }));

  // Nothing worth an email — skip so we don't send an empty digest.
  if (risingReels.length === 0 && hooks.length === 0) return "skipped_empty";

  const { subject, html, text } = buildWeeklyDigest({
    siteOrigin: getSiteUrl(),
    risingReels,
    hooks,
    researchedCount: researchedRes.count ?? 0,
    scriptsCount: scriptsRes.count ?? 0,
    unsubscribeUrl: digestUnsubscribeUrl(userId),
  });

  const ok = await sendEmail({ to, subject, html, text });
  if (!ok) throw new Error("sendEmail returned false");

  void track(userId, "digest_sent", { rising: risingReels.length, hooks: hooks.length });
  return "sent";
}
