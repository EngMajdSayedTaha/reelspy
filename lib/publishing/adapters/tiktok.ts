// TikTok publisher — Content Posting API (PULL_FROM_URL).
//
//   video, direct → POST /v2/post/publish/video/init/    → publish_id
//   video, draft  → POST /v2/post/publish/inbox/video/init/
//   photos        → POST /v2/post/publish/content/init/   media_type=PHOTO
//                   with source_info.photo_images[] + photo_cover_index
// then in every case: poll POST /v2/post/publish/status/fetch/ until
// PUBLISH_COMPLETE.
//
// Requires the `video.publish` scope (TikTok app audit). Until the app is
// audited TikTok forces SELF_ONLY (private) posts; we therefore default to
// SELF_ONLY and only allow the creator's chosen level when TIKTOK_ALLOW_PUBLIC
// is true. PULL_FROM_URL also requires the URL's domain to be verified in the
// TikTok developer portal (URL Prefix / domain verification) — which is what
// R2_PUBLIC_BASE_URL is for; the raw R2 S3 host can never be verified.

import { numEnv } from "@/lib/utils/env";
import { publishFetch } from "../http";
import type { PlatformAdapter, PublishInput, PublishResult } from "../types";
import { buildCaption } from "../caption";

export const API_BASE = "https://open.tiktokapis.com/v2";
function pollIntervalMs(): number {
  return numEnv("PUBLISH_POLL_INTERVAL_MS", 4000);
}

function statusDeadlineMs(): number {
  return numEnv("PUBLISH_CONTAINER_TIMEOUT_MS", 4 * 60_000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type TikTokError = { code?: string; message?: string };

export function tiktokError(error: TikTokError | undefined, status: number): string {
  if (error && error.code && error.code !== "ok") {
    return `TikTok error: ${error.message ?? error.code}`;
  }
  return `TikTok API error (${status})`;
}

async function tiktokPost<T>(
  path: string,
  accessToken: string,
  body: unknown,
  retries = 0
): Promise<{ ok: boolean; status: number; json: T & { error?: TikTokError } }> {
  const res = await publishFetch(
    `${API_BASE}${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
    },
    { retries }
  );
  const json = (await res.json().catch(() => ({}))) as T & { error?: TikTokError };
  return { ok: res.ok, status: res.status, json };
}

type StatusResponse = {
  data?: {
    status?: string;
    fail_reason?: string;
    // TikTok's own spelling. Present once a DIRECT_POST finishes; it is the
    // only way to build a real permalink, since init returns just a publish_id.
    publicaly_available_post_id?: string[] | string;
    publicly_available_post_id?: string[] | string;
  };
  error?: TikTokError;
};

function firstPostId(data: StatusResponse["data"]): string | null {
  const raw = data?.publicaly_available_post_id ?? data?.publicly_available_post_id;
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

/**
 * Poll until TikTok finishes. Returns the public post id when it hands one
 * back. A timeout is NOT an error: the upload was accepted and the publish_id
 * is the durable handle, so we return what we have rather than telling the user
 * a successful post failed.
 */
async function waitForPublish(
  publishId: string,
  accessToken: string
): Promise<{ postId: string | null }> {
  const deadline = Date.now() + statusDeadlineMs();

  for (;;) {
    await sleep(pollIntervalMs());

    const { ok, status, json } = await tiktokPost<StatusResponse>(
      "/post/publish/status/fetch/",
      accessToken,
      { publish_id: publishId },
      2
    );
    if (!ok) throw new Error(tiktokError(json.error, status));

    const state = json.data?.status;
    if (state === "PUBLISH_COMPLETE") return { postId: firstPostId(json.data) };
    if (state === "FAILED") {
      throw new Error(`TikTok publish failed: ${json.data?.fail_reason ?? "unknown"}`);
    }
    if (Date.now() > deadline) return { postId: firstPostId(json.data) };
  }
}

function permalink(postId: string | null, username: string | null | undefined): string | null {
  if (!postId || !username) return null;
  return `https://www.tiktok.com/@${username.replace(/^@/, "")}/video/${postId}`;
}

export const tiktokAdapter: PlatformAdapter = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const allowPublic = process.env.TIKTOK_ALLOW_PUBLIC === "true";
    const options = input.tiktokOptions;
    const accessToken = input.creds.accessToken;
    const isPhotoPost = input.media.every((item) => item.kind === "image");

    // Requested privacy level comes straight from the creator's real options
    // (fetched live from creator_info/query — never hardcoded here). Until the
    // app audit passes, TikTok forces every direct post to SELF_ONLY.
    const requestedLevel =
      options?.privacyLevel ?? (input.privacy === "public" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY");
    const privacyLevel = allowPublic ? requestedLevel : "SELF_ONLY";
    const isDraft = options?.postMode === "draft";

    // TikTok rejects branded/paid-partnership content posted privately — the
    // disclosure has to be visible to an audience. The composer + server action
    // both gate this; this is the last line of defense so a bad request never
    // reaches TikTok's API unexplained.
    if (!isDraft && options?.brandedContent && privacyLevel === "SELF_ONLY") {
      throw new Error(
        "TikTok does not allow branded content to post as private — pick a public privacy level, or wait until the app audit passes."
      );
    }

    // ── Photos ───────────────────────────────────────────────────────────────
    if (isPhotoPost) {
      const caption = buildCaption(input.content);
      const coverIndex = Math.min(Math.max(input.coverIndex, 0), input.media.length - 1);

      const { ok, status, json } = await tiktokPost<{ data?: { publish_id?: string } }>(
        "/post/publish/content/init/",
        accessToken,
        {
          post_mode: isDraft ? "MEDIA_UPLOAD" : "DIRECT_POST",
          media_type: "PHOTO",
          post_info: {
            title: (input.content.title || input.content.caption || "").slice(0, 90),
            description: caption.slice(0, 4000),
            ...(isDraft
              ? {}
              : {
                  privacy_level: privacyLevel,
                  disable_comment: false,
                  auto_add_music: options?.autoAddMusic ?? true,
                  brand_content_toggle: Boolean(options?.brandedContent),
                  brand_organic_toggle: Boolean(options?.brandOrganic),
                }),
          },
          source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: coverIndex,
            photo_images: input.media.map((item) => item.tiktokUrl ?? item.url),
          },
        }
      );
      if (!ok || !json.data?.publish_id) throw new Error(tiktokError(json.error, status));
      const publishId = json.data.publish_id;

      // A draft lands in the creator's inbox; there is no server-side
      // completion to wait for, so the publish_id is the receipt.
      if (isDraft) return { remoteId: publishId, remoteUrl: null };

      const { postId } = await waitForPublish(publishId, accessToken);
      return { remoteId: publishId, remoteUrl: permalink(postId, input.creds.accountUsername) };
    }

    // ── Video ────────────────────────────────────────────────────────────────
    const video = input.media[0];
    if (!video || video.kind !== "video") {
      throw new Error("TikTok needs either a video or a set of photos.");
    }

    // "Draft" routes to the inbox endpoint — TikTok imports the video into the
    // creator's own app inbox and they finish composing (caption, privacy,
    // disclosure) inside TikTok itself, so none of post_info applies.
    if (isDraft) {
      const { ok, status, json } = await tiktokPost<{ data?: { publish_id?: string } }>(
        "/post/publish/inbox/video/init/",
        accessToken,
        { source_info: { source: "PULL_FROM_URL", video_url: video.tiktokUrl ?? video.url } }
      );
      if (!ok || !json.data?.publish_id) throw new Error(tiktokError(json.error, status));
      return { remoteId: json.data.publish_id, remoteUrl: null };
    }

    const { ok, status, json } = await tiktokPost<{ data?: { publish_id?: string } }>(
      "/post/publish/video/init/",
      accessToken,
      {
        post_info: {
          title: buildCaption(input.content).slice(0, 2200),
          privacy_level: privacyLevel,
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
          brand_content_toggle: Boolean(options?.brandedContent),
          brand_organic_toggle: Boolean(options?.brandOrganic),
        },
        source_info: { source: "PULL_FROM_URL", video_url: video.tiktokUrl ?? video.url },
      }
    );
    if (!ok || !json.data?.publish_id) throw new Error(tiktokError(json.error, status));
    const publishId = json.data.publish_id;

    const { postId } = await waitForPublish(publishId, accessToken);
    return { remoteId: publishId, remoteUrl: permalink(postId, input.creds.accountUsername) };
  },
};

// Refresh an expired TikTok access token using the stored refresh token.
// Access tokens last ~24h; refresh tokens ~365 days (and rotate on use).
export async function refreshTikTokToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error("Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET.");
  }

  const res = await publishFetch(
    `${API_BASE}/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
    { retries: 1 }
  );

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`TikTok token refresh failed: ${json.error_description ?? json.error ?? res.status}`);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresInSeconds: json.expires_in ?? 86400,
  };
}
