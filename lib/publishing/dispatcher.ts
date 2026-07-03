// Publish dispatcher: fans one uploaded video out to its platform targets.
//
// Loads a post's PENDING jobs, mints a short-lived signed URL for the uploaded
// video, resolves per-platform credentials (refreshing expired TikTok/YouTube
// tokens), and runs each platform adapter — writing the remote id/url/status
// back per job. Idempotent: only `pending` jobs run, so a cron/inline retry
// can't double-post. Used by both the "Post now" action and the cron worker.

import type { SupabaseClient } from "@supabase/supabase-js";
import { presignGetUrl } from "@/lib/storage/r2";
import { getIgCredentials, getPageCredentials } from "@/lib/instagram/token-store";
import {
  getConnection,
  markConnectionInvalid,
  updateConnectionTokens,
} from "./token-store";
import { instagramAdapter } from "./adapters/instagram";
import { facebookAdapter } from "./adapters/facebook";
import { tiktokAdapter, refreshTikTokToken } from "./adapters/tiktok";
import { youtubeAdapter, refreshYouTubeToken } from "./adapters/youtube";
import { track } from "@/lib/analytics/track";
import { notifyPublishFailure, type FailedTarget } from "@/lib/email/publish-failure";
import type {
  PlatformAdapter,
  Platform,
  PublishContent,
  ResolvedCredentials,
} from "./types";

const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 min — long enough for IG/TikTok transcode.

const ADAPTERS: Record<Platform, PlatformAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
};

type PostRow = {
  id: string;
  user_id: string;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  video_path: string;
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
};

export type DispatchResult = {
  postId: string;
  published: number;
  failed: number;
};

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
      return { creds: { accessToken: ig.token, accountId: ig.igUserId } };
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
    case "youtube": {
      const conn = await getConnection(admin, userId, job.platform);
      if (!conn?.access_token) return { error: `${job.platform} is not connected.` };

      let accessToken = conn.access_token;
      const expired =
        conn.token_expires_at != null &&
        new Date(conn.token_expires_at).getTime() <= Date.now() + 60_000;

      if (expired) {
        if (!conn.refresh_token) {
          await markConnectionInvalid(admin, conn.id);
          return { error: `${job.platform} session expired — reconnect the account.` };
        }
        try {
          if (job.platform === "tiktok") {
            const r = await refreshTikTokToken(conn.refresh_token);
            accessToken = r.accessToken;
            await updateConnectionTokens(admin, conn.id, {
              accessToken: r.accessToken,
              refreshToken: r.refreshToken,
              expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000).toISOString(),
            });
          } else {
            const r = await refreshYouTubeToken(conn.refresh_token);
            accessToken = r.accessToken;
            await updateConnectionTokens(admin, conn.id, {
              accessToken: r.accessToken,
              expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000).toISOString(),
            });
          }
        } catch {
          await markConnectionInvalid(admin, conn.id);
          return { error: `${job.platform} session expired — reconnect the account.` };
        }
      }

      return { creds: { accessToken, accountId: conn.account_id } };
    }
  }
}

export async function dispatchPost(
  admin: SupabaseClient,
  postId: string
): Promise<DispatchResult> {
  const { data: postData, error: postErr } = await admin
    .from("publish_posts")
    .select("id, user_id, title, caption, hashtags, video_path, status")
    .eq("id", postId)
    .maybeSingle();

  if (postErr) throw new Error(postErr.message);
  if (!postData) throw new Error("Post not found.");
  const post = postData as PostRow;

  const { data: jobs } = await admin
    .from("publish_jobs")
    .select("id, platform, connection_id, privacy, status, attempts, caption")
    .eq("post_id", postId)
    .eq("status", "pending")
    .returns<JobRow[]>();

  if (!jobs || jobs.length === 0) {
    return { postId, published: 0, failed: 0 };
  }

  await admin.from("publish_posts").update({ status: "publishing" }).eq("id", postId);

  // Sign the R2 object once for all targets — the adapters hand this URL to each
  // platform so they can pull the video bytes directly.
  let signedVideoUrl: string;
  try {
    signedVideoUrl = await presignGetUrl(post.video_path, SIGNED_URL_TTL_SECONDS);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    throw new Error(`Could not sign the uploaded video: ${message}`);
  }

  let published = 0;
  let failed = 0;
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
        signedVideoUrl,
        creds: resolved.creds,
        privacy: job.privacy,
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
      await admin
        .from("publish_jobs")
        .update({
          status: "failed",
          error_message: errorText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed += 1;
      failedTargets.push({ platform: job.platform, error: errorText });
      void track(post.user_id, "publish_job_finished", {
        platform: job.platform,
        status: "failed",
        post_id: postId,
      });
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
  const postStatus =
    stillFailed === 0 ? "done" : succeeded > 0 ? "partial" : "failed";

  await admin
    .from("publish_posts")
    .update({ status: postStatus, updated_at: new Date().toISOString() })
    .eq("id", postId);

  // One summary email per publish with at least one failed target. Fail-open:
  // notification errors never affect the returned result.
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
  }

  return { postId, published, failed };
}
