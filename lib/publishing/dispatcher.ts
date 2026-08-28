// Publish dispatcher: fans one post out to its platform targets.
//
// Loads a post's PENDING jobs, signs its media, resolves per-platform
// credentials (refreshing expired TikTok/YouTube/Threads tokens), and runs each
// platform adapter — writing the remote id/url/status back per job. Idempotent:
// only `pending` jobs run, so a cron/inline retry can't double-post.
//
// Always called from the durable job queue (`/api/cron/run-jobs`), never inline
// from a server action: a carousel is a dozen platform round-trips and
// Instagram alone polls for minutes, which is far longer than a server action
// should ever hold a response open.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isInvalidTokenError, isMetaRateLimitMessage } from "@/lib/instagram/graph-api";
import { getIgCredentials, getPageCredentials } from "@/lib/instagram/token-store";
import { graphBaseForAuthFlow } from "@/lib/meta/graph";
import { resolveOAuthAccessToken } from "./oauth-token";
import { loadPublishMedia } from "./media";
import { instagramAdapter } from "./adapters/instagram";
import { facebookAdapter } from "./adapters/facebook";
import { tiktokAdapter } from "./adapters/tiktok";
import { youtubeAdapter } from "./adapters/youtube";
import { threadsAdapter } from "./adapters/threads";
import { track } from "@/lib/analytics/track";
import { notifyPublishFailure, type FailedTarget } from "@/lib/email/publish-failure";
import { notifyAdmins } from "@/lib/notifications/notify";
import type {
  PlatformAdapter,
  Platform,
  PublishContent,
  PublishMediaItem,
  MediaKind,
  ResolvedCredentials,
  TikTokPostOptions,
} from "./types";

const ADAPTERS: Record<Platform, PlatformAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  threads: threadsAdapter,
};

type PostRow = {
  id: string;
  user_id: string;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  video_path: string | null;
  media_kind: MediaKind | null;
  cover_index: number | null;
  cover_ms: number | null;
  status: string;
};

type JobRow = {
  id: string;
  platform: Platform;
  connection_id: string | null;
  privacy: string;
  status: string;
  attempts: number;
  // Per-platform caption override; null = use the shared post caption.
  caption: string | null;
  // TikTok-only compliance panel choices (T4); null for every other platform
  // and for TikTok jobs created before this column existed.
  platform_options: TikTokPostOptions | null;
};

export type DispatchResult = {
  postId: string;
  published: number;
  failed: number;
  /** Jobs left `pending` because the failure looked transient. */
  deferred: number;
};

/**
 * Is this failure worth another pass, or is it the platform saying no?
 *
 * A rate limit, a timeout or a 5xx will very likely succeed later, and burning
 * the job to `failed` makes the user press Retry for something that only needed
 * a minute. An invalid token or a rejected caption will never succeed on its
 * own, so those stay terminal and surface immediately.
 */
export function isRetryableFailure(message: string): boolean {
  if (isInvalidTokenError(message)) return false;
  if (isMetaRateLimitMessage(message)) return true;

  const lowered = message.toLowerCase();
  return (
    lowered.includes("timeouterror") ||
    lowered.includes("timed out") ||
    lowered.includes("still processing") ||
    lowered.includes("publishing limit") ||
    lowered.includes("rate limit") ||
    lowered.includes("too many requests") ||
    /\((?:429|500|502|503|504)\)/.test(message) ||
    lowered.includes("fetch failed") ||
    lowered.includes("econnreset") ||
    lowered.includes("socket hang up")
  );
}

// Resolve the credentials an adapter needs, refreshing tokens where possible.
// Returns null with a reason when the platform isn't connected / can't be used.
async function resolveCredentials(
  admin: SupabaseClient,
  userId: string,
  job: JobRow
): Promise<{ creds: ResolvedCredentials } | { error: string }> {
  switch (job.platform) {
    case "instagram": {
      const ig = await getIgCredentials(admin, userId);
      if (!ig) return { error: "Instagram is not connected." };
      return {
        creds: {
          accessToken: ig.token,
          accountId: ig.igUserId,
          igGraphBase: graphBaseForAuthFlow(ig.authFlow),
        },
      };
    }
    case "facebook": {
      const page = await getPageCredentials(admin, userId);
      if (!page) return { error: "No Facebook Page is connected." };
      return {
        creds: {
          accessToken: page.pageToken,
          accountId: page.pageId,
          pageId: page.pageId,
          pageToken: page.pageToken,
        },
      };
    }
    case "tiktok":
    case "youtube":
    case "threads": {
      const resolved = await resolveOAuthAccessToken(admin, userId, job.platform);
      if ("error" in resolved) return resolved;
      return {
        creds: {
          accessToken: resolved.accessToken,
          accountId: resolved.connection.account_id,
          accountUsername: resolved.connection.account_username,
        },
      };
    }
  }
}

/**
 * Give up on a post whose queue job has spent its retries.
 *
 * A deferred target is left `pending` on purpose so the queue re-runs it — but
 * the queue eventually parks the job as `failed`, and at that point nothing
 * else in the system will ever look at those rows again. Without this the post
 * sits on "Publishing" forever, with a Retry button that is the user's only
 * clue anything is wrong. Called by the worker when failJob reports it did not
 * reschedule.
 */
export async function abandonPendingJobs(
  admin: SupabaseClient,
  postId: string,
  reason: string
): Promise<void> {
  // One statement, so the status flip and the reason land together and the
  // `pending`/`processing` filter can't miss rows a partial write left behind.
  const { data: stranded } = await admin
    .from("publish_jobs")
    .update({
      status: "failed",
      error_message: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("post_id", postId)
    .in("status", ["pending", "processing"])
    .select("id")
    .returns<{ id: string }[]>();

  if (!stranded || stranded.length === 0) return;

  const { data: allJobs } = await admin
    .from("publish_jobs")
    .select("status")
    .eq("post_id", postId)
    .returns<{ status: string }[]>();

  const succeeded = allJobs?.filter((j) => j.status === "published").length ?? 0;
  await admin
    .from("publish_posts")
    .update({
      status: succeeded > 0 ? "partial" : "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);
}

export async function dispatchPost(
  admin: SupabaseClient,
  postId: string
): Promise<DispatchResult> {
  const { data: postData, error: postErr } = await admin
    .from("publish_posts")
    .select("id, user_id, title, caption, hashtags, video_path, media_kind, cover_index, cover_ms, status")
    .eq("id", postId)
    .maybeSingle();

  if (postErr) throw new Error(postErr.message);
  if (!postData) throw new Error("Post not found.");
  const post = postData as PostRow;

  const { data: jobs } = await admin
    .from("publish_jobs")
    .select("id, platform, connection_id, privacy, status, attempts, caption, platform_options")
    .eq("post_id", postId)
    .eq("status", "pending")
    .returns<JobRow[]>();

  if (!jobs || jobs.length === 0) {
    return { postId, published: 0, failed: 0, deferred: 0 };
  }

  await admin.from("publish_posts").update({ status: "publishing" }).eq("id", postId);

  // Sign every slide once for all targets — the adapters hand these URLs to
  // each platform so they can pull the bytes directly.
  let media: PublishMediaItem[];
  try {
    media = await loadPublishMedia(admin, post.id, post.video_path);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    throw new Error(`Could not prepare the post's media: ${message}`);
  }

  const mediaKind: MediaKind =
    post.media_kind ?? (media.length > 1 ? "carousel" : media[0].kind === "image" ? "image" : "video");

  let published = 0;
  let failed = 0;
  let deferred = 0;
  const failedTargets: FailedTarget[] = [];

  for (const job of jobs) {
    await admin
      .from("publish_jobs")
      .update({ status: "processing", attempts: job.attempts + 1, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    // Per-platform caption override falls back to the shared post caption.
    const content: PublishContent = {
      title: post.title,
      caption: job.caption ?? post.caption,
      hashtags: post.hashtags,
    };

    try {
      const resolved = await resolveCredentials(admin, post.user_id, job);
      if ("error" in resolved) throw new Error(resolved.error);

      const result = await ADAPTERS[job.platform].publish({
        content,
        media,
        mediaKind,
        coverIndex: post.cover_index ?? 0,
        coverMs: post.cover_ms,
        creds: resolved.creds,
        privacy: job.privacy,
        tiktokOptions: job.platform === "tiktok" ? job.platform_options ?? undefined : undefined,
      });

      await admin
        .from("publish_jobs")
        .update({
          status: "published",
          remote_id: result.remoteId,
          remote_url: result.remoteUrl,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      published += 1;
      void track(post.user_id, "publish_job_finished", {
        platform: job.platform,
        status: "success",
        post_id: postId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorText = message.slice(0, 500);

      // A transient failure goes back to `pending` so the queue's own backoff
      // re-runs it (the job row keeps its incremented `attempts`, so a target
      // that keeps failing still converges on the queue's max_attempts). Only a
      // terminal failure is written as `failed` and shown to the user.
      const retryable = isRetryableFailure(message);
      await admin
        .from("publish_jobs")
        .update({
          status: retryable ? "pending" : "failed",
          error_message: errorText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (retryable) {
        deferred += 1;
        void track(post.user_id, "publish_job_finished", {
          platform: job.platform,
          status: "deferred",
          post_id: postId,
        });
      } else {
        failed += 1;
        failedTargets.push({ platform: job.platform, error: errorText });
        void track(post.user_id, "publish_job_finished", {
          platform: job.platform,
          status: "failed",
          post_id: postId,
        });
      }
    }
  }

  // Honest post status computed over ALL of the post's jobs, not just the ones
  // that ran this pass — a retry re-dispatches a single job, so we must look at
  // the whole set to know whether the post is fully done, partial, or failed.
  const { data: allJobs } = await admin
    .from("publish_jobs")
    .select("status")
    .eq("post_id", postId)
    .returns<{ status: string }[]>();

  const succeeded = allJobs?.filter((j) => j.status === "published").length ?? 0;
  const stillFailed = allJobs?.filter((j) => j.status === "failed").length ?? 0;
  const stillPending =
    allJobs?.filter((j) => j.status === "pending" || j.status === "processing").length ?? 0;

  // A post with work still queued stays `publishing` — calling it done or
  // failed while a target is waiting on a retry would be a lie the UI repeats.
  const postStatus =
    stillPending > 0
      ? "publishing"
      : stillFailed === 0
        ? "done"
        : succeeded > 0
          ? "partial"
          : "failed";

  await admin
    .from("publish_posts")
    .update({ status: postStatus, updated_at: new Date().toISOString() })
    .eq("id", postId);

  // One summary email per publish with at least one permanently failed target.
  // Deferred targets are deliberately silent — they haven't failed yet. Fail
  // open: notification errors never affect the returned result.
  if (failed > 0) {
    try {
      const { data: userRes } = await admin.auth.admin.getUserById(post.user_id);
      const to = userRes?.user?.email;
      if (to) {
        await notifyPublishFailure({
          to,
          postTitle: post.title || post.caption || "Untitled post",
          // Overall successes across all targets (a retry re-runs one job), so
          // the "partial vs all-failed" copy reflects the post's true state.
          published: succeeded,
          failed: failedTargets,
        });
      }
    } catch (err) {
      console.warn(
        "[dispatchPost] failure notification skipped:",
        err instanceof Error ? err.message : err
      );
    }

    // The founder's copy. OFF by default in the catalog — the user is already
    // told, and one rejected caption is their problem, not an incident. It's
    // here so it can be switched ON during a platform outage, when a wave of
    // these is the fastest signal that an integration has broken.
    await notifyAdmins(
      "publish.failed",
      {
        title: `Publish failed on ${failedTargets.map((t) => t.platform).join(", ")}`,
        summary: failedTargets[0]?.error?.slice(0, 200) ?? null,
        context: {
          "Post id": postId,
          "User id": post.user_id,
          Succeeded: String(succeeded),
          Failed: String(stillFailed),
        },
        link: "/admin/ops",
        // Per platform: a platform-wide outage folds into one alert, while two
        // different platforms breaking stay two separate signals.
        dedupeKey: `publish:${failedTargets.map((t) => t.platform).sort().join("+")}`,
      },
      { admin }
    );
  }

  return { postId, published, failed, deferred };
}
