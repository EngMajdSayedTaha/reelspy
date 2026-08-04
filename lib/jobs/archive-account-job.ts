// Full-history archive of one public account's reels — a deep, RESUMABLE walk
// backwards through Business Discovery's media edge.
//
// Why it can't be one loop: a big account is dozens of Graph calls, the shared
// Meta circuit can close mid-walk for a full hour, and serverless invocations
// don't last that long. So the walk runs in bounded CHUNKS: fetch a few pages,
// persist the cursor to ig_account_archives, re-enqueue, repeat. State lives in
// Postgres precisely because the process holding it will not survive the job.
//
// Reels land in the shared ig_reel_snapshots cache, so the second user to ask
// for @nike pays nothing. Fan-out into personal feeds is limited to users who
// actually requested an archive (ig_account_archive_requests) — see the
// migration for why that separation exists.
//
// On `since`: scripts/probe-bd-since.mjs confirmed Meta honors `.since()` on
// this edge, and we deliberately do NOT use it here. The walk already stops at
// the target date, so `since` would save no calls — it would only make the
// boundary page return LESS. Everything fetched is kept, so overshooting the
// cutoff is free extra coverage, not waste. It would also mean cursors were
// minted under a filter that a later, deeper request doesn't share, and mixing
// those is a correctness problem for the resume. The client-side cutoff
// (ReelsPageResult.oldestPostedAt) is strictly better on every axis.
//
// Service-role only.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountUnavailableError,
  isMetaRateLimitMessage,
  fetchAccountReelsPage,
} from "@/lib/instagram/graph-api";
import {
  MetaRateLimitError,
  createMetaRateLimiter,
  readHourlyBudget,
  SYSTEM_USER_ID,
  WORKER_BUDGET_SHARE,
} from "@/lib/instagram/rate-limit";
import { deeperSince } from "@/lib/instagram/archive-range";
import { isSelfHosted } from "@/lib/instagram/media-cache";
import {
  materializeForUser,
  normalizeUsername,
  pickHealthyToken,
} from "@/lib/instagram/snapshots";
import { numEnv } from "@/lib/utils/env";

// Pages per worker pass. Small enough that one account can't hold the worker (or
// the shared Meta budget) hostage; large enough that a year of history usually
// finishes in one or two passes.
const PAGES_PER_RUN = numEnv("ARCHIVE_PAGES_PER_RUN", 8);
// Safety backstop, not the steering wheel — the date range is the real control.
// This only exists so a pathological account can't walk forever.
const MAX_REELS = numEnv("ARCHIVE_MAX_REELS", 2000);
const PAGE_PACE_MS = numEnv("ARCHIVE_PAGE_PACE_MS", 350);

export type ArchiveOutcome =
  | "completed" // reached the target date, the account's first post, or the ceiling
  | "continued" // chunk done, more history to walk — worker re-enqueues
  | "throttled" // shared limiter/circuit closed — defer, don't count an attempt
  | "no_token" // nobody has a healthy IG connection
  | "not_found" // private / personal / gone — terminal
  | "skipped"; // nothing to do

export type ArchiveProgress = {
  status: "queued" | "running" | "done" | "partial" | "failed";
  reelsFound: number;
  pagesFetched: number;
  oldestSeenAt: string | null;
  exhausted: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

type ArchiveRow = {
  ig_username: string;
  status: string;
  cursor: string | null;
  exhausted: boolean;
  oldest_seen_at: string | null;
  target_since: string | null;
  reels_found: number;
  pages_fetched: number;
};

// Does the shared archive already cover everything this request asks for?
// `exhausted` means the walk reached the account's first post, so no request
// however deep can return more.
export function archiveCovers(
  archive: Pick<ArchiveRow, "exhausted" | "oldest_seen_at"> | null,
  targetSince: string | null
): boolean {
  if (!archive) return false;
  if (archive.exhausted) return true;
  if (!targetSince) return false; // "everything" is only covered by exhaustion
  const oldest = toMs(archive.oldest_seen_at);
  const target = toMs(targetSince);
  return oldest != null && target != null && oldest <= target;
}

// Errors here are NOT "no archive yet". Reading a failure as an absent row is
// how a walk silently restarts from page 1 on every pass: it re-fetches the same
// history forever, never advances a cursor it can't see, and never reaches the
// completion that triggers fan-out — all while spending Business Discovery calls
// and reporting `done` on every job. That is precisely what a missing
// ig_account_archives table did in production for fourteen hours. The state this
// walk resumes from is load-bearing, so a read that didn't happen must throw.
async function loadArchive(
  admin: SupabaseClient,
  uname: string
): Promise<ArchiveRow | null> {
  const { data, error } = await admin
    .from("ig_account_archives")
    .select(
      "ig_username, status, cursor, exhausted, oldest_seen_at, target_since, reels_found, pages_fetched"
    )
    .eq("ig_username", uname)
    .maybeSingle();
  if (error) throw new Error(`archive state unreadable for @${uname}: ${error.message}`);
  return (data as ArchiveRow | null) ?? null;
}

// Copy a finished archive into the feed of every user who asked for one. Pure DB
// work — the Meta cost was paid once, by the walk.
async function fanOutToRequesters(admin: SupabaseClient, uname: string): Promise<number> {
  // An unreadable request list is indistinguishable from "nobody asked", and
  // both hand back zero — but one of them means a finished archive silently
  // reaches no feed at all, which is the single failure the user actually sees.
  const { data: requests, error: requestsError } = await admin
    .from("ig_account_archive_requests")
    .select("user_id")
    .eq("ig_username", uname);

  if (requestsError) {
    throw new Error(`archive fan-out list unreadable for @${uname}: ${requestsError.message}`);
  }

  let served = 0;

  for (const request of requests ?? []) {
    try {
      const { data: account } = await admin
        .from("inspiration_accounts")
        .select("id")
        .eq("user_id", request.user_id)
        .eq("ig_username", uname)
        .maybeSingle();

      // They asked, then stopped tracking the account. Leave the request row: if
      // they re-add it, the history is already cached and lands for free.
      if (!account) continue;

      // No limit — the whole point is the entire cached history.
      await materializeForUser(admin, admin, request.user_id, account.id, uname);

      const { count } = await admin
        .from("tracked_reels")
        .select("id", { count: "exact", head: true })
        .eq("user_id", request.user_id)
        .eq("account_id", account.id);

      await admin
        .from("ig_account_archive_requests")
        .update({
          materialized_at: new Date().toISOString(),
          reels_materialized: count ?? 0,
        })
        .eq("ig_username", uname)
        .eq("user_id", request.user_id);

      served += 1;
    } catch (err) {
      // One user's materialize failing must not abort the fan-out for the rest.
      console.warn(
        `[archive-account-job] fan-out failed user=${request.user_id} @${uname}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return served;
}

export async function runArchiveAccount(
  admin: SupabaseClient,
  igUsername: string,
  opts?: { since?: string | null }
): Promise<ArchiveOutcome> {
  const uname = normalizeUsername(igUsername ?? "");
  if (!uname) return "skipped";

  // The archive rows FK to the snapshot row, so make sure it exists.
  await admin
    .from("ig_account_snapshots")
    .upsert({ ig_username: uname }, { onConflict: "ig_username", ignoreDuplicates: true });

  const existing = await loadArchive(admin, uname);

  // Two users can ask for different depths of the same account, and they share
  // ONE walk. It has to run to the deeper of the two asks, or whoever requested
  // last would silently cap the other. `since: undefined` means "inherit
  // whatever depth is already targeted"; `since: null` means "everything".
  const requestedSince = opts && "since" in opts ? opts.since ?? null : undefined;
  const targetSince = !existing
    ? requestedSince ?? null
    : requestedSince === undefined
      ? existing.target_since
      : deeperSince(requestedSince, existing.target_since);

  // Already covered — answer from cache, spend nothing, and still hand the user
  // their reels (they may never have received a fan-out).
  if (archiveCovers(existing, targetSince)) {
    await admin
      .from("ig_account_archives")
      .update({
        status: existing?.status === "partial" ? "partial" : "done",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("ig_username", uname);
    await fanOutToRequesters(admin, uname);
    return "completed";
  }

  const caller = await pickHealthyToken(admin);
  if (!caller) return "no_token";

  // Claim the walk before spending a single Meta call. If this row can't be
  // written there is nowhere to persist a cursor, so the pages we're about to
  // fetch would be re-fetched on every future pass — pay for the walk only once
  // we know we can remember where it got to.
  if (!existing) {
    const { error: claimError } = await admin.from("ig_account_archives").insert({
      ig_username: uname,
      status: "running",
      target_since: targetSince,
      started_at: new Date().toISOString(),
    });
    if (claimError) {
      throw new Error(`archive not startable for @${uname}: ${claimError.message}`);
    }
  } else {
    const { error: claimError } = await admin
      .from("ig_account_archives")
      .update({
        status: "running",
        target_since: targetSince,
        started_at: existing.status === "done" ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("ig_username", uname);
    if (claimError) {
      throw new Error(`archive not resumable for @${uname}: ${claimError.message}`);
    }
  }

  // System limiter: takes only the worker's share of the app budget, leaving
  // headroom for people clicking Sync right now.
  const budget = await readHourlyBudget(admin);
  const limiter = createMetaRateLimiter(
    admin,
    SYSTEM_USER_ID,
    Math.max(1, Math.floor(budget * WORKER_BUDGET_SHARE))
  );

  let cursor: string | undefined = existing?.cursor ?? undefined;
  // Where this pass began. A pass that walks its whole page budget and lands on
  // the cursor it started from is not making progress, and re-enqueueing it just
  // repeats the same calls on the next tick.
  const startCursor = cursor;
  let reelsFound = existing?.reels_found ?? 0;
  let pagesFetched = existing?.pages_fetched ?? 0;
  let oldestSeenMs = toMs(existing?.oldest_seen_at);
  const targetSinceMs = toMs(targetSince);

  let exhausted = false;
  let reachedTarget = false;
  let hitCeiling = false;

  // The cursor write IS the resume point. A silent failure here doesn't lose a
  // status field, it loses the walk's position — so the next pass starts over
  // and the chain never terminates. Throw instead: the worker's backoff retries,
  // and the job dies visibly at max_attempts rather than looping forever.
  const saveProgress = async (status: ArchiveProgress["status"], error?: string) => {
    const finished = status === "done" || status === "partial" || status === "failed";
    const { error: saveError } = await admin
      .from("ig_account_archives")
      .update({
        status,
        cursor: cursor ?? null,
        exhausted,
        oldest_seen_at: oldestSeenMs != null ? new Date(oldestSeenMs).toISOString() : null,
        reels_found: reelsFound,
        pages_fetched: pagesFetched,
        last_error: error ?? null,
        finished_at: finished ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("ig_username", uname);
    if (saveError) {
      throw new Error(`archive progress not saved for @${uname}: ${saveError.message}`);
    }
  };

  // One chunk = one logical refresh for quota accounting, however many pages it
  // takes underneath (same treatment refreshAccountSnapshot gives a paged sync).
  // The app-wide token bucket is still charged per real HTTP call — that's the
  // cost Meta actually meters.
  limiter.startOperation();

  try {
    for (let page = 0; page < PAGES_PER_RUN; page++) {
      if (page > 0 && PAGE_PACE_MS > 0) await sleep(PAGE_PACE_MS);

      const result = await fetchAccountReelsPage(caller.igUserId, caller.token, uname, {
        after: cursor,
        limiter,
      });

      pagesFetched += 1;

      const rows = result.reels.filter((r) => r.id && r.permalink);

      if (rows.length > 0) {
        // Don't clobber a thumbnail the sync path already self-hosted. Instagram's
        // signed CDN URLs expire, and a dead signed URL can't be retried back to
        // life — overwriting a permanent copy with an expiring one would quietly
        // break images that currently work.
        //
        // Deep history is NOT thumbnail-cached: an account's full archive can run
        // to thousands of images, and the archive exists to answer questions about
        // cadence and performance, which the metrics, captions and permalinks
        // already carry. Recent reels keep their cached copies via the sync path.
        const { data: known } = await admin
          .from("ig_reel_snapshots")
          .select("ig_media_id, thumbnail_url")
          .eq("ig_username", uname)
          .in(
            "ig_media_id",
            rows.map((r) => r.id)
          );

        const knownThumbs = new Map(
          (known ?? []).map((k) => [k.ig_media_id as string, k.thumbnail_url as string | null])
        );

        const seenAt = new Date().toISOString();
        const upserts = rows.map((r) => {
          const cached = knownThumbs.get(r.id);
          return {
            ig_username: uname,
            ig_media_id: r.id,
            permalink: r.permalink!,
            caption: r.caption ?? null,
            thumbnail_url: isSelfHosted(cached) ? cached! : r.thumbnail_url ?? null,
            view_count: r.view_count ?? 0,
            like_count: r.like_count ?? 0,
            comment_count: r.comments_count ?? 0,
            posted_at: r.timestamp ?? null,
            last_seen_at: seenAt,
          };
        });

        const { error: upsertError } = await admin
          .from("ig_reel_snapshots")
          .upsert(upserts, { onConflict: "ig_username,ig_media_id" });
        if (upsertError) throw new Error(`snapshot upsert failed: ${upsertError.message}`);

        // Count only reels this archive actually discovered, so the progress
        // number means "history recovered" rather than "pages re-walked".
        reelsFound += rows.filter((r) => !knownThumbs.has(r.id)).length;
      }

      const pageOldest = toMs(result.oldestPostedAt);
      if (pageOldest != null && (oldestSeenMs == null || pageOldest < oldestSeenMs)) {
        oldestSeenMs = pageOldest;
      }

      cursor = result.nextCursor;

      // No cursor means Meta has nothing older: we reached the account's first
      // post. Trustworthy precisely BECAUSE no `since` filter is in play — under
      // one, a dry page would only mean "past the cutoff" (see the header note).
      if (!cursor) {
        exhausted = true;
        break;
      }
      if (targetSinceMs != null && oldestSeenMs != null && oldestSeenMs <= targetSinceMs) {
        reachedTarget = true;
        break;
      }
      if (reelsFound >= MAX_REELS) {
        hitCeiling = true;
        break;
      }
    }
  } catch (err) {
    // Deferred by the shared guard, or throttled by Meta itself. Either way the
    // pages already walked are saved, so resuming costs nothing extra.
    if (
      err instanceof MetaRateLimitError ||
      (err instanceof Error && isMetaRateLimitMessage(err.message))
    ) {
      if (err instanceof Error && isMetaRateLimitMessage(err.message)) {
        await limiter.recordThrottle();
      }
      await saveProgress("running", "throttled — resuming when Instagram reopens");
      return "throttled";
    }

    if (err instanceof AccountUnavailableError) {
      await saveProgress("failed", err.message);
      return "not_found";
    }

    // Unclassified: keep the progress, then let the worker's backoff retry.
    // Both paths end in failJob, so if the save itself fails the ORIGINAL fault
    // is the more useful one to report — it's what a reader needs to diagnose.
    try {
      await saveProgress("running", err instanceof Error ? err.message : String(err));
    } catch (saveErr) {
      console.warn(
        `[archive-account-job] progress save failed for @${uname}:`,
        saveErr instanceof Error ? saveErr.message : saveErr
      );
    }
    throw err;
  } finally {
    limiter.endOperation();
  }

  const finished = exhausted || reachedTarget || hitCeiling;

  // Meta handed back the same cursor for an entire page budget: the walk is
  // standing still. Continuing would re-fetch identical pages on every tick,
  // forever, out of a quota every customer shares — so stop and keep what we
  // have. `partial` is honest about the history being incomplete, and fan-out
  // still runs so the reels already paid for reach the people who asked.
  if (!finished && cursor === startCursor) {
    await saveProgress("partial", "walk stopped advancing — Instagram returned no newer position");
    await fanOutToRequesters(admin, uname);
    return "completed";
  }

  if (!finished) {
    await saveProgress("running");
    // Hand over what this chunk recovered instead of holding it back until the
    // whole walk ends. A deep archive is many chunks spread over hours (a Meta
    // cooldown alone can park one for a full hour), and fanning out only at the
    // end means the user clicks "full history", is told it's running, and then
    // watches an unchanged feed for the rest of the day — which reads as broken.
    // It's pure DB work against reels already paid for, and materializeForUser
    // is idempotent, so the feed simply fills in as the walk goes deeper.
    await fanOutToRequesters(admin, uname);
    return "continued";
  }

  // The ceiling is the one ending that didn't answer the question asked, so it
  // is recorded as `partial` rather than dressed up as a complete archive.
  await saveProgress(hitCeiling && !exhausted ? "partial" : "done");
  await fanOutToRequesters(admin, uname);
  return "completed";
}
