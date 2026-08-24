// YouTube publisher — Data API v3 resumable upload (videos.insert).
//
//   1. POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
//      with the metadata JSON → returns an upload session URL in the Location header
//   2. PUT the video bytes to that session URL → returns the created video resource
//
// Requires the `youtube.upload` scope (sensitive — Google OAuth verification).
// A videos.insert costs ~1600 of the default 10,000 units/day quota (~6/day).
// Until the project passes the YouTube API audit, uploaded videos are locked to
// `private`, so we default to private and only honor `public` when
// YOUTUBE_ALLOW_PUBLIC=true.

import { numEnv } from "@/lib/utils/env";
import { publishFetch } from "../http";
import type { PlatformAdapter, PublishInput, PublishResult } from "../types";
import { buildCaption } from "../caption";

const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

export const youtubeAdapter: PlatformAdapter = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const video = input.media[0];
    if (!video || video.kind !== "video" || input.media.length > 1) {
      throw new Error("YouTube can only publish a single video.");
    }

    const allowPublic = process.env.YOUTUBE_ALLOW_PUBLIC === "true";
    const privacyStatus = input.privacy === "public" && allowPublic ? "public" : "private";

    const metadata = {
      snippet: {
        title: (input.content.title || input.content.caption || "Untitled").slice(0, 100),
        description: buildCaption(input.content).slice(0, 5000),
      },
      status: { privacyStatus, selfDeclaredMadeForKids: false },
    };

    // 1. Open the resumable session.
    const initRes = await publishFetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.creds.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": video.mimeType || "video/*",
      },
      body: JSON.stringify(metadata),
    });
    if (!initRes.ok) {
      const body = await initRes.text();
      throw new Error(`YouTube upload init failed (${initRes.status}): ${body.slice(0, 200)}`);
    }
    const sessionUrl = initRes.headers.get("location");
    if (!sessionUrl) throw new Error("YouTube did not return an upload session URL.");

    // 2. Pipe the bytes from R2 straight into the session.
    //
    // This used to be `await videoRes.arrayBuffer()`, which pulled the entire
    // video into the function's heap before sending a single byte — a 300 MB
    // reel was 300 MB of resident memory, and the larger ones simply OOM'd the
    // invocation. Streaming keeps memory flat regardless of file size.
    const videoRes = await fetch(video.url, { cache: "no-store" });
    if (!videoRes.ok || !videoRes.body) {
      throw new Error("Could not read the uploaded video for YouTube.");
    }

    const contentLength = videoRes.headers.get("content-length");
    const headers: Record<string, string> = { "Content-Type": video.mimeType || "video/*" };
    let body: BodyInit;

    if (contentLength) {
      headers["Content-Length"] = contentLength;
      body = videoRes.body;
    } else {
      // No Content-Length means we can't stream (the resumable endpoint needs
      // the length up front), so fall back to buffering — with a ceiling, so an
      // unbounded file fails with a clear message instead of killing the worker.
      const maxBytes = numEnv("YOUTUBE_MAX_BUFFER_MB", 200) * 1024 * 1024;
      const buffered = await videoRes.arrayBuffer();
      if (buffered.byteLength > maxBytes) {
        throw new Error(
          `This video is too large to upload to YouTube from here (${Math.round(
            buffered.byteLength / (1024 * 1024)
          )} MB).`
        );
      }
      body = buffered;
    }

    const uploadRes = await publishFetch(sessionUrl, {
      method: "PUT",
      headers,
      body,
      // Required by undici to stream a request body: the request keeps sending
      // while the response is still being read.
      ...(contentLength ? ({ duplex: "half" } as Record<string, unknown>) : {}),
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`YouTube upload failed (${uploadRes.status}): ${text.slice(0, 200)}`);
    }

    const { id: videoId } = (await uploadRes.json()) as { id?: string };
    if (!videoId) throw new Error("YouTube did not return a video id.");

    return { remoteId: videoId, remoteUrl: `https://www.youtube.com/watch?v=${videoId}` };
  },
};

// Refresh an expired YouTube/Google access token (these last ~1h). The refresh
// token is long-lived and does not rotate, so we keep the stored one.
export async function refreshYouTubeToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresInSeconds: number;
}> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET.");
  }

  const res = await publishFetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
    { retries: 1 }
  );

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`YouTube token refresh failed: ${json.error_description ?? json.error ?? res.status}`);
  }

  return { accessToken: json.access_token, expiresInSeconds: json.expires_in ?? 3600 };
}
