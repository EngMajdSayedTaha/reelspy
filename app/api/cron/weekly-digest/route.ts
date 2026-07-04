import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/utils/cron";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { buildWeeklyDigest, type DigestReel, type DigestHook } from "@/lib/email/weekly-digest";
import { digestUnsubscribeUrl } from "@/lib/email/digest-token";
import { rankRising, risingSinceIso } from "@/lib/reels/ranking";
import { track } from "@/lib/analytics/track";
import { numEnv } from "@/lib/utils/env";

// Weekly niche digest (V3/W6). Triggered by .github/workflows/weekly-digest.yml
// (Vercel Hobby caps crons at once a day and both slots are taken by the
// snapshot/token refreshers, so the weekly schedule lives in GitHub Actions —
// same pattern as poll-youtube-comments). For each opted-in user with content:
// top rising reels + saved-hook nudges + a WLC prompt.
export const runtime = "nodejs";
export const maxDuration = 300;

const RISING_LIMIT = 5;
const HOOKS_LIMIT = 3;

function firstUsername(v: unknown): string {
  if (!v) return "unknown";
  const row = Array.isArray(v) ? v[0] : v;
  return (row as { ig_username?: string })?.ig_username ?? "unknown";
}

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://reelspy-one.vercel.app").replace(
    /\/+$/,
    ""
  );
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) {
    // No mailer wired yet — succeed as a no-op so the schedule doesn't error.
    return NextResponse.json({ ok: true, skipped: "email_not_configured" });
  }

  const admin = createAdminClient();
  const batch = numEnv("DIGEST_BATCH", 200);

  // Opted-in users only.
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id")
    .eq("digest_opt_out", false)
    .limit(batch)
    .returns<{ id: string }[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // Build a user_id → email map (profiles doesn't store email).
  const emailById = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = list?.users ?? [];
    for (const u of users) if (u.email) emailById.set(u.id, u.email);
    if (users.length < 1000) break;
  }

  const since = risingSinceIso();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const origin = siteOrigin();

  let sent = 0;
  let skipped = 0;

  for (const profile of profiles) {
    const to = emailById.get(profile.id);
    if (!to) {
      skipped++;
      continue;
    }

    try {
      const [risingRes, hooksRes, researchedRes, scriptsRes] = await Promise.all([
        admin
          .from("tracked_reels")
          .select(
            "id, caption, ig_permalink, viral_score, posted_at, inspiration_accounts!inner(ig_username)"
          )
          .eq("user_id", profile.id)
          .eq("is_discarded", false)
          .eq("is_worked_on", false)
          .eq("inspiration_accounts.is_active", true)
          .gte("posted_at", since)
          .order("posted_at", { ascending: false })
          .limit(300),
        admin
          .from("saved_hooks")
          .select("text, reel_id")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(HOOKS_LIMIT),
        admin
          .from("tracked_reels")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .gte("created_at", weekAgo),
        admin
          .from("generated_scripts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
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

      const hooks: DigestHook[] = ((hooksRes.data ?? []) as { text: string; reel_id: string | null }[]).map(
        (h) => ({ text: h.text, reelId: h.reel_id })
      );

      // Nothing worth an email — skip so we don't send an empty digest.
      if (risingReels.length === 0 && hooks.length === 0) {
        skipped++;
        continue;
      }

      const { subject, html, text } = buildWeeklyDigest({
        siteOrigin: origin,
        risingReels,
        hooks,
        researchedCount: researchedRes.count ?? 0,
        scriptsCount: scriptsRes.count ?? 0,
        unsubscribeUrl: digestUnsubscribeUrl(profile.id),
      });

      const ok = await sendEmail({ to, subject, html, text });
      if (ok) {
        sent++;
        void track(profile.id, "digest_sent", {
          rising: risingReels.length,
          hooks: hooks.length,
        });
      } else {
        skipped++;
      }
    } catch (err) {
      skipped++;
      console.warn(
        `[weekly-digest] user=${profile.id} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({ ok: true, sent, skipped });
}
