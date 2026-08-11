import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import { isAdminUser } from "@/lib/billing/admin";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { getIgCredentials } from "@/lib/instagram/token-store";
import {
  DEFAULT_ARCHIVE_RANGE,
  deeperSince,
  isArchiveRange,
  sinceForRange,
} from "@/lib/instagram/archive-range";
import { archiveCovers } from "@/lib/jobs/archive-account-job";
import { readArchiveStatuses } from "@/lib/instagram/archive-status";
import { normalizeUsername } from "@/lib/instagram/snapshots";
import { enqueueJob } from "@/lib/jobs/queue";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";
import type { AiTier } from "@/lib/ai/tier";

// Full-history archive of one tracked account. POST starts (or deepens) the
// walk; GET reports progress for the accounts this user has asked about.
//
// The walk itself runs in the durable queue — see lib/jobs/archive-account-job.ts.
// This route only decides whether the user may ask, records the request, and
// wakes the worker.
export const runtime = "nodejs";

// Deep archives are the most Business-Discovery-expensive thing a single click
// can trigger, out of a pool every customer shares. So they're a paid feature
// with a daily allowance that scales the same way tracked accounts do.
const ARCHIVE_DAILY_CAP: Record<AiTier, number> = {
  free: 0,
  creator: 3,
  pro: 10,
  studio: 30,
  custom: 10,
};

type ArchiveBody = {
  account_id?: string;
  range?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ArchiveBody;

  if (typeof body.account_id !== "string" || !body.account_id) {
    return NextResponse.json({ error: "account_id is required." }, { status: 400 });
  }

  const range = isArchiveRange(body.range) ? body.range : DEFAULT_ARCHIVE_RANGE;

  // RLS scopes this to the caller, so a foreign account id simply isn't found.
  const { data: account } = await supabase
    .from("inspiration_accounts")
    .select("id, ig_username")
    .eq("id", body.account_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  const uname = normalizeUsername(account.ig_username);

  // The walk runs on a system token, but requiring the caller's own connection
  // keeps the cost attached to someone who has actually connected Instagram —
  // otherwise a user could spend the shared pool while contributing nothing to
  // the app-wide budget it's sized from.
  const credentials = await getIgCredentials(admin, user.id).catch(() => null);
  if (!credentials) {
    return NextResponse.json(
      { error: "Instagram account is not connected. Go to Settings → Instagram to connect." },
      { status: 400 }
    );
  }
  if (credentials.status === "invalid" || credentials.status === "expired") {
    return NextResponse.json(
      { error: "Your Instagram connection expired. Go to Settings → Instagram to reconnect." },
      { status: 400 }
    );
  }

  const isAdmin = await isAdminUser(supabase, user.id);
  const { tier } = await resolveUserEntitlements(supabase, user.id);
  const dailyCap = ARCHIVE_DAILY_CAP[tier] ?? 0;

  if (!isAdmin && dailyCap <= 0) {
    return NextResponse.json(
      {
        error:
          "Full history is available on paid plans. Upgrade in Billing to pull an account's whole reel archive.",
        upgradeRequired: true,
      },
      { status: 403 }
    );
  }

  const requestedSince = sinceForRange(range);

  // The archive row FKs to the snapshot row, so make sure that exists first.
  await admin
    .from("ig_account_snapshots")
    .upsert({ ig_username: uname }, { onConflict: "ig_username", ignoreDuplicates: true });

  const { data: archive } = await admin
    .from("ig_account_archives")
    .select("status, exhausted, oldest_seen_at, target_since, reels_found")
    .eq("ig_username", uname)
    .maybeSingle();

  // Someone already walked this far — for anyone, not just this user. Serving it
  // costs nothing, so it must not cost a daily allowance either.
  const alreadyCovered = archiveCovers(archive ?? null, requestedSince);

  if (!isAdmin && !alreadyCovered) {
    const { allowed, retryAfterSeconds } = await consumeUserAction(
      admin,
      user.id,
      "archive_account",
      dailyCap
    );
    if (!allowed) {
      const hours = Math.max(1, Math.round(retryAfterSeconds / 3600));
      return NextResponse.json(
        {
          error: `You've used your ${dailyCap} full-history pulls for today. More unlock in about ${hours} hr.`,
          retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterSeconds)) } }
      );
    }
  }

  // Record who asked and how deep. This is what limits fan-out on completion —
  // without it, a paid user's archive would land in the feed of every free user
  // tracking the same account.
  await admin.from("ig_account_archive_requests").upsert(
    {
      ig_username: uname,
      user_id: user.id,
      since: requestedSince,
      requested_at: new Date().toISOString(),
    },
    { onConflict: "ig_username,user_id" }
  );

  // Concurrent asks for the same account share one walk, so widen the stored
  // target to the deeper of the two. A job already in flight reads this row, so
  // a deeper request isn't lost just because the dedup key was taken.
  if (archive) {
    const merged = deeperSince(requestedSince, archive.target_since as string | null);
    if (merged !== archive.target_since) {
      await admin
        .from("ig_account_archives")
        .update({ target_since: merged, updated_at: new Date().toISOString() })
        .eq("ig_username", uname);
    }
  }

  const { skipped } = await enqueueJob(admin, {
    kind: "archive_account",
    payload: { ig_username: uname, since: requestedSince },
    userId: user.id,
    dedupKey: `archive:${uname}`,
    maxAttempts: 10,
  });

  // Nudge the worker so the walk starts in seconds rather than on the next cron
  // tick. Best-effort; the schedule is the safety net.
  if (!skipped && process.env.CRON_SECRET) {
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

  await track(user.id, "archive_requested", {
    username: uname,
    // Attribution for the per-account activity timeline on the dossier.
    account_id: account.id,
    range,
    alreadyCovered,
    alreadyRunning: skipped,
  });

  return NextResponse.json({
    status: alreadyCovered ? "cached" : skipped ? "running" : "queued",
    username: uname,
    range,
    reelsFound: archive?.reels_found ?? 0,
  });
}

// Progress for one account (?account_id=) or every archive this user has asked
// for. Polled by the accounts page while a walk is in flight.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = new URL(request.url).searchParams.get("account_id");

  let accountsQuery = supabase
    .from("inspiration_accounts")
    .select("id, ig_username")
    .eq("user_id", user.id);

  if (accountId) accountsQuery = accountsQuery.eq("id", accountId);

  const { data: accounts } = await accountsQuery;
  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ archives: [] });
  }

  const admin = createAdminClient();

  return NextResponse.json({
    archives: await readArchiveStatuses(admin, user.id, accounts),
  });
}
