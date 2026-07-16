import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import {
  refreshAccountSnapshot,
  materializeForUser,
  normalizeUsername,
} from "@/lib/instagram/snapshots";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { enqueueTopReelTranscriptions } from "@/lib/media/auto-transcribe";
import { enqueueJob } from "@/lib/jobs/queue";
import { numEnv } from "@/lib/utils/env";

// Paced requests + multi-account loops need a generous budget.
export const runtime = "nodejs";
export const maxDuration = 300;

type SyncBody = {
  account_id?: string;
  limit?: number;
  force?: boolean;
  // "Sync All" sets this: serve the shared cache instantly and refresh stale
  // accounts in the background instead of blocking on Meta. See the async path.
  deferred?: boolean;
};

// How many reels to pull per account. Clamped to a sane range.
const DEFAULT_SYNC_LIMIT = 25;
const MAX_SYNC_LIMIT = 200;

// "Sync All" skips accounts synced more recently than this — an account you
// just synced individually has nothing new, so re-syncing it is double work.
const SKIP_FRESH_SECONDS = numEnv("SYNC_SKIP_FRESH_SECONDS", 1800);

// Bulk "Sync All" serves any account whose SHARED snapshot is newer than this
// straight from the cache — no Meta call — so N users syncing overlapping
// accounts collapse to a single fetch instead of one fetch each. This is the
// key scaling lever: Meta cost tracks the number of DISTINCT accounts, not
// users × accounts. Explicit single-account syncs and `force` always fetch.
const BULK_SYNC_TTL_SECONDS = numEnv("SYNC_BULK_TTL_SECONDS", 1800);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  // Admin client: global snapshot cache, the shared rate limiter, and the IG
  // token (browser-facing roles can't read the token column).
  const admin = createAdminClient();

  let credentials;
  try {
    credentials = await getIgCredentials(admin, user.id);
  } catch (credError) {
    console.error("Failed to load IG credentials", credError);
    return NextResponse.json({ error: "Could not load your Instagram connection." }, { status: 500 });
  }

  if (!credentials) {
    return NextResponse.json(
      { error: "Instagram account is not connected. Go to Settings → Instagram to connect." },
      { status: 400 }
    );
  }

  // Token was flagged dead by the refresh worker — tell the user to reconnect
  // instead of letting every sync fail silently.
  if (credentials.status === "invalid" || credentials.status === "expired") {
    return NextResponse.json(
      { error: "Your Instagram connection expired. Go to Settings → Instagram to reconnect." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as SyncBody;
  const syncLimit = resolveLimit(body.limit);

  // Build query for inspiration accounts to sync
  let accountsQuery = supabase
    .from("inspiration_accounts")
    .select("id, ig_username, last_synced_at, avatar_url, display_name, followers_count")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (body.account_id) {
    accountsQuery = accountsQuery.eq("id", body.account_id);
  }

  const { data: allAccounts, error: accountsError } = await accountsQuery;

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 });
  }

  if (!allAccounts || allAccounts.length === 0) {
    return NextResponse.json({
      inserted: 0,
      updated: 0,
      skippedFresh: 0,
      errors: body.account_id ? ["Account not found."] : ["No active inspiration accounts. Add some on the Accounts page."],
    });
  }

  // No double work: a bulk "Sync All" skips accounts that were synced moments
  // ago (e.g. individually from their card). Explicit single-account syncs and
  // `force` always run.
  const skipBefore = Date.now() - SKIP_FRESH_SECONDS * 1000;
  const isBulk = !body.account_id && !body.force;
  const accounts = isBulk
    ? allAccounts.filter(
        (a) => !a.last_synced_at || new Date(a.last_synced_at).getTime() < skipBefore
      )
    : allAccounts;
  const skippedFresh = allAccounts.length - accounts.length;

  if (accounts.length === 0) {
    return NextResponse.json({
      inserted: 0,
      updated: 0,
      skippedFresh,
      message: "Everything is already up to date — nothing to sync.",
    });
  }

  // "Sync All" — the whole-batch bulk request AND the dashboard's per-account
  // orchestration (deferred: true) — takes the ASYNC path: serve the shared
  // cache instantly, then refresh any stale account in the BACKGROUND via the
  // durable job queue (deduped by username). It never calls Meta inline, so
  // users never block on the shared pool or wait on each other's syncs. An
  // explicit single-account sync (or `force`) still fetches inline for on-demand
  // freshness.
  const asyncMode = !body.force && (body.deferred === true || !body.account_id);

  let totalInserted = 0;
  let totalUpdated = 0;
  let queued = 0;
  const errors: string[] = [];

  let rateLimitHit = false;
  let retryAfterSeconds: number | undefined;

  if (asyncMode) {
    // Pull shared-snapshot freshness for the whole batch up front so we only
    // enqueue a refresh for accounts whose cache is actually stale or missing.
    const unames = accounts.map((a) => normalizeUsername(a.ig_username));
    const { data: snaps } = await admin
      .from("ig_account_snapshots")
      .select("ig_username, last_fetched_at, last_status")
      .in("ig_username", unames);
    const freshAt = new Map(
      (snaps ?? [])
        .filter((s) => s.last_status === "ok" && s.last_fetched_at)
        .map((s) => [s.ig_username, new Date(s.last_fetched_at as string).getTime()])
    );
    const staleBefore = Date.now() - BULK_SYNC_TTL_SECONDS * 1000;

    for (const account of accounts) {
      const uname = normalizeUsername(account.ig_username);

      // Serve whatever the shared cache holds right now — pure DB, no quota, no
      // wait. New reels a background refresh fetches land on the next load.
      const { inserted, updated } = await materializeForUser(
        admin,
        supabase,
        user.id,
        account.id,
        uname,
        syncLimit
      );
      totalInserted += inserted;
      totalUpdated += updated;

      // Refresh in the background when the shared snapshot is stale/missing.
      // Deduped by username: N users syncing @nike enqueue ONE fetch.
      const fetchedAt = freshAt.get(uname);
      if (fetchedAt == null || fetchedAt <= staleBefore) {
        const { skipped } = await enqueueJob(admin, {
          kind: "refresh_snapshot",
          payload: { ig_username: uname, max_reels: syncLimit },
          dedupKey: `refresh:${uname}`,
        });
        if (!skipped) queued += 1;
      }

      await supabase
        .from("inspiration_accounts")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", account.id);
    }

    // Nudge the queue worker so background refreshes start within seconds instead
    // of waiting for the next cron tick. Best-effort; the cron is the safety net.
    if (queued > 0 && process.env.CRON_SECRET) {
      after(async () => {
        try {
          await fetch(new URL("/api/cron/run-jobs", request.url), {
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          });
        } catch {
          // Best-effort; the scheduled run-jobs cron will drain the queue.
        }
      });
    }
  } else {
    // Inline path: explicit single-account sync or `force` — fetch fresh now.
    // Shared, app-wide guard on the admin client (limiter RPCs are revoked for
    // browser-facing roles); Business Discovery is rate-limited per Meta APP.
    const limiter = createMetaRateLimiter(admin, user.id);
    // Only pace between calls that actually hit Meta — cache hits need no throttle.
    let lastCalledMeta = false;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      // Throttle between real Meta calls to stay under Instagram's app-level limit.
      if (i > 0 && lastCalledMeta) {
        await sleep(300);
      }

      const snap = await refreshAccountSnapshot(
        admin,
        limiter,
        credentials.igUserId,
        credentials.token,
        account.ig_username,
        { maxReels: syncLimit, force: true }
      );
      lastCalledMeta = snap.fetched;

      if (snap.rateLimited) {
        retryAfterSeconds = snap.retryAfterSeconds ?? retryAfterSeconds;
        rateLimitHit = true;
      }

      if (snap.status === "error" || snap.status === "not_found") {
        if (snap.error) errors.push(`@${account.ig_username}: ${snap.error}`);
      }

      // Refresh this user's account row from the freshly-fetched profile
      // (avatar/followers/handle). Rides along in the same call — no extra quota
      // — and runs on EVERY sync because IG's signed profile_picture URLs expire.
      if (snap.profile) {
        await supabase
          .from("inspiration_accounts")
          .update({
            display_name: snap.profile.display_name,
            followers_count: snap.profile.followers_count,
            avatar_url: snap.profile.avatar_url,
          })
          .eq("id", account.id);
      }

      // Materialize from the cache into this user's feed — pure DB, no quota.
      const { inserted, updated } = await materializeForUser(
        admin,
        supabase,
        user.id,
        account.id,
        account.ig_username,
        syncLimit
      );
      totalInserted += inserted;
      totalUpdated += updated;

      // Don't stamp a throttled refresh as "synced".
      if (!snap.rateLimited) {
        await supabase
          .from("inspiration_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", account.id);
      }

      // Stop early on throttling so we don't worsen the app-level limit.
      if (rateLimitHit) break;
    }
  }

  // Human-readable retry window for the rate-limit message.
  function formatRetry(seconds?: number): string {
    if (!seconds || seconds <= 0) return "about an hour";
    const mins = Math.ceil(seconds / 60);
    if (mins < 60) return `about ${mins} min`;
    const hrs = Math.round(mins / 60);
    return `about ${hrs} hr${hrs > 1 ? "s" : ""}`;
  }

  let rateLimitMessage: string | undefined;
  if (rateLimitHit) {
    rateLimitMessage = `Instagram's hourly request limit was reached, so the sync paused. Try again in ${formatRetry(
      retryAfterSeconds
    )}.`;
    errors.push(rateLimitMessage);
  }

  const payload = {
    inserted: totalInserted,
    updated: totalUpdated,
    skippedFresh: skippedFresh || undefined,
    // Number of accounts queued for a background refresh (async "Sync All").
    queued: queued || undefined,
    rateLimited: rateLimitHit || undefined,
    retryAfterSeconds: rateLimitHit ? retryAfterSeconds : undefined,
    // `error` is what the client surfaces as the primary message.
    error: rateLimitHit && totalInserted === 0 && totalUpdated === 0 ? rateLimitMessage : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };

  // Instrumentation (L5): a research event — the input half of the WLC loop.
  await track(user.id, "feed_synced", {
    inserted: totalInserted,
    updated: totalUpdated,
    rateLimited: rateLimitHit,
  });

  // W5/V2: once reels have landed, enqueue transcribe jobs for the top
  // untranscribed ones (V4 durable queue). The cron worker does the Whisper work
  // with quota discipline; here we just fan out jobs after the response is sent.
  if (totalInserted > 0 || totalUpdated > 0) {
    after(() => enqueueTopReelTranscriptions(admin, user.id));
  }

  // Surface throttling as 429 + Retry-After so clients (and proxies) can back off
  // properly, but only when nothing synced — partial successes stay 200.
  if (rateLimitHit && totalInserted === 0 && totalUpdated === 0) {
    return NextResponse.json(payload, {
      status: 429,
      headers: retryAfterSeconds ? { "Retry-After": String(Math.ceil(retryAfterSeconds)) } : undefined,
    });
  }

  return NextResponse.json(payload);
}
