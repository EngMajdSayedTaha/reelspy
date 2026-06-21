// TikTok publisher — Content Posting API (Direct Post, PULL_FROM_URL).
//
//   1. POST /v2/post/publish/video/init/   → publish_id   (TikTok pulls the URL)
//   2. poll  POST /v2/post/publish/status/fetch/  until PUBLISH_COMPLETE
//
// Requires the `video.publish` scope (TikTok app audit). Until the app is
// audited TikTok forces SELF_ONLY (private) posts; we therefore default to
// SELF_ONLY and only allow PUBLIC_TO_EVERYONE when TIKTOK_ALLOW_PUBLIC=true.
// PULL_FROM_URL also requires the URL's domain to be verified in the TikTok
// developer portal (URL Prefix / domain verification).

import type { PlatformAdapter, PublishInput, PublishResult } from "../types";
import { buildCaption } from "../caption";

const API_BASE = "https://open.tiktokapis.com/v2";
const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 4000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TikTokError = { code?: string; message?: string };

function tiktokError(error: TikTokError | undefined, status: number): string {
  if (error && error.code && error.code !== "ok") {
    return `TikTok error: ${error.message ?? error.code}`;
  }
  return `TikTok API error (${status})`;
}

export const tiktokAdapter: PlatformAdapter = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const allowPublic = process.env.TIKTOK_ALLOW_PUBLIC === "true";
    const privacyLevel =
      input.privacy === "public" && allowPublic ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY";

    const initRes = await fetch(`${API_BASE}/post/publish/video/init/`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${input.creds.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: buildCaption(input.content).slice(0, 2200),
          privacy_level: privacyLevel,
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: input.signedVideoUrl,
        },
      }),
    });

    const initJson = (await initRes.json()) as {
      data?: { publish_id?: string };
      error?: TikTokError;
    };
    if (!initRes.ok || !initJson.data?.publish_id) {
      throw new Error(tiktokError(initJson.error, initRes.status));
    }
    const publishId = initJson.data.publish_id;

    // Poll for completion.
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${input.creds.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      });
      const statusJson = (await statusRes.json()) as {
        data?: { status?: string; fail_reason?: string };
        error?: TikTokError;
      };
      if (!statusRes.ok) throw new Error(tiktokError(statusJson.error, statusRes.status));

      const status = statusJson.data?.status;
      if (status === "PUBLISH_COMPLETE") break;
      if (status === "FAILED") {
        throw new Error(`TikTok publish failed: ${statusJson.data?.fail_reason ?? "unknown"}`);
      }
      if (i === MAX_POLLS - 1) {
        // Upload accepted; TikTok is still finalizing. Treat as success — the
        // publish_id is the durable handle.
        break;
      }
    }

    return { remoteId: publishId, remoteUrl: null };
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

  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

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
