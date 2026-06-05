import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAccountReels } from "@/lib/instagram/graph-api";

type SyncBody = {
  account_id?: string;
  limit?: number;
};

// How many reels to pull per account. Clamped to a sane range.
const DEFAULT_SYNC_LIMIT = 25;
const MAX_SYNC_LIMIT = 200;

function resolveLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SYNC_LIMIT;
  return Math.min(MAX_SYNC_LIMIT, Math.max(1, Math.floor(n)));
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("ig_access_token, ig_user_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile?.ig_access_token || !profile.ig_user_id) {
    return NextResponse.json(
      { error: "Instagram account is not connected. Go to Settings → Instagram to connect." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as SyncBody;
  const syncLimit = resolveLimit(body.limit);

  // Build query for inspiration accounts to sync
  let accountsQuery = supabase
    .from("inspiration_accounts")
    .select("id, ig_username")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (body.account_id) {
    accountsQuery = accountsQuery.eq("id", body.account_id);
  }

  const { data: accounts, error: accountsError } = await accountsQuery;

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({
      inserted: 0,
      skipped: 0,
      errors: body.account_id ? ["Account not found."] : ["No active inspiration accounts. Add some on the Accounts page."],
    });
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    const { reels, error: fetchError } = await fetchAccountReels(
      profile.ig_user_id,
      profile.ig_access_token,
      account.ig_username,
      syncLimit
    );

    if (fetchError) {
      errors.push(`@${account.ig_username}: ${fetchError}`);
      continue;
    }

    if (reels.length === 0) {
      // Update last_synced_at even if no new reels
      await supabase
        .from("inspiration_accounts")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", account.id);
      continue;
    }

    const mediaIds = reels.map((r) => r.id).filter(Boolean);

    const { data: existingRows } = await supabase
      .from("tracked_reels")
      .select("ig_media_id")
      .eq("user_id", user.id)
      .in("ig_media_id", mediaIds);

    const existingIds = new Set((existingRows ?? []).map((row) => row.ig_media_id));

    const inserts = reels
      .filter((r) => r.id && !existingIds.has(r.id) && r.permalink)
      .map((r) => ({
        user_id: user.id,
        account_id: account.id,
        ig_media_id: r.id,
        ig_permalink: r.permalink!,
        caption: r.caption ?? null,
        thumbnail_url: r.thumbnail_url ?? null,
        view_count: r.view_count ?? 0,
        like_count: r.like_count ?? 0,
        comment_count: r.comments_count ?? 0,
        posted_at: r.timestamp ?? null,
      }));

    if (inserts.length > 0) {
      const { error: insertError } = await supabase.from("tracked_reels").insert(inserts);
      if (insertError) {
        errors.push(`@${account.ig_username}: ${insertError.message}`);
        continue;
      }
      totalInserted += inserts.length;
    }

    // Refresh metrics on reels we already track — counts (and views) change over
    // time, and reels synced before view_count support need backfilling.
    const updates = reels.filter((r) => r.id && existingIds.has(r.id));
    for (const r of updates) {
      const { error: updateError } = await supabase
        .from("tracked_reels")
        .update({
          view_count: r.view_count ?? 0,
          like_count: r.like_count ?? 0,
          comment_count: r.comments_count ?? 0,
          thumbnail_url: r.thumbnail_url ?? null,
        })
        .eq("user_id", user.id)
        .eq("ig_media_id", r.id);
      if (updateError) {
        errors.push(`@${account.ig_username}: ${updateError.message}`);
        break;
      }
    }
    totalUpdated += updates.length;

    await supabase
      .from("inspiration_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", account.id);
  }

  return NextResponse.json({
    inserted: totalInserted,
    updated: totalUpdated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
