// Publish dispatcher: fans one uploaded video out to its platform targets.
//
// Loads a post's PENDING jobs, mints a short-lived signed URL for the uploaded
// video, resolves per-platform credentials (refreshing expired TikTok/YouTube
// tokens), and runs each platform adapter — writing the remote id/url/status
// back per job. Idempotent: only `pending` jobs run, so a cron/inline retry
// can't double-post. Used by both the "Post now" action and the cron worker.

import type { SupabaseClient } from "@supabase/supabase-js";
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

  // Sign the upload once for all targets.
  const { data: signed, error: signErr } = await admin.storage
    .from("publish-media")
    .createSignedUrl(post.video_path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`Could not sign the uploaded video: ${signErr?.message ?? "unknown"}`);
  }

  let published = 0;
  let failed = 0;

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
        signedVideoUrl: signed.signedUrl,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await admin
        .from("publish_jobs")
        .update({
          status: "failed",
          error_message: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed += 1;
    }
  }

  await admin
    .from("publish_posts")
    .update({
      status: failed === 0 ? "done" : published > 0 ? "done" : "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  return { postId, published, failed };
}
