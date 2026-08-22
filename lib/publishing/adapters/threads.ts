// Threads publisher — Threads API (graph.threads.net).
//
//   single  → POST /{threads-user-id}/threads  media_type=IMAGE|VIDEO&image_url|video_url&text
//   carousel→ one child per slide (is_carousel_item=true), then
//             POST /{threads-user-id}/threads  media_type=CAROUSEL&children=id1,id2 (2–20)
// then in both cases: POST /{threads-user-id}/threads_publish  creation_id=…
//
// Threads is a separate product from the Graph API even though it lives in the
// same App Dashboard: its own Threads App ID/Secret, its own OAuth window at
// threads.net, and its own host. Scopes: threads_basic + threads_content_publish.
//
// Meta's docs recommend waiting ~30s before publishing a container, so we poll
// the container's `status` field rather than sleeping blindly. Containers expire
// after 24h; profiles are limited to 250 published posts per 24h, and a carousel
// counts as one.

import { THREADS_BASE } from "@/lib/meta/graph";
import { numEnv } from "@/lib/utils/env";
import { publishFetch } from "../http";
import type { PlatformAdapter, PublishInput, PublishMediaItem, PublishResult } from "../types";
import { buildCaption } from "../caption";

const POLL_INTERVAL_MS = 3000;

function containerDeadlineMs(): number {
  return numEnv("PUBLISH_CONTAINER_TIMEOUT_MS", 4 * 60_000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ThreadsErrorBody = {
  error?: { message?: string; error_user_msg?: string; type?: string; code?: number };
};

async function threadsError(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const body = JSON.parse(raw) as ThreadsErrorBody;
    const message = body.error?.error_user_msg ?? body.error?.message;
    if (message) return `Threads error: ${message}`;
  } catch {
    // fall through to the status-only message
  }
  return `Threads API error (${response.status})`;
}

/** Create one container and return its id. Never retried — it creates state. */
async function createContainer(
  userId: string,
  accessToken: string,
  params: Record<string, string>
): Promise<string> {
  const url = new URL(`${THREADS_BASE}/${userId}/threads`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", accessToken);

  const res = await publishFetch(url, { method: "POST" });
  if (!res.ok) throw new Error(await threadsError(res));
  const { id } = (await res.json()) as { id?: string };
  if (!id) throw new Error("Threads did not return a media container id.");
  return id;
}

/**
 * Poll a container until Threads finishes processing it. An IMAGE container is
 * usually ready immediately; VIDEO and CAROUSEL take longer, which is why
 * publishing straight after creation intermittently fails.
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  deadline: number
): Promise<void> {
  for (;;) {
    await sleep(POLL_INTERVAL_MS);

    const url = new URL(`${THREADS_BASE}/${containerId}`);
    url.searchParams.set("fields", "status,error_message");
    url.searchParams.set("access_token", accessToken);

    const res = await publishFetch(url, {}, { retries: 2 });
    if (!res.ok) throw new Error(await threadsError(res));
    const { status, error_message } = (await res.json()) as {
      status?: string;
      error_message?: string;
    };

    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Threads could not process the media: ${error_message ?? status}`);
    }
    if (Date.now() > deadline) {
      throw new Error("Threads is still processing the media. It will be retried shortly.");
    }
  }
}

function childParams(item: PublishMediaItem): Record<string, string> {
  return item.kind === "video"
    ? { is_carousel_item: "true", media_type: "VIDEO", video_url: item.url }
    : { is_carousel_item: "true", media_type: "IMAGE", image_url: item.url };
}

export const threadsAdapter: PlatformAdapter = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const { accountId: userId, accessToken } = input.creds;
    // Threads caps the body at 500 characters and has no separate title field.
    const text = buildCaption(input.content).slice(0, 500);
    const deadline = Date.now() + containerDeadlineMs();

    let containerId: string;

    if (input.mediaKind === "carousel") {
      const children = await Promise.all(
        input.media.map((item) => createContainer(userId, accessToken, childParams(item)))
      );
      await Promise.all(children.map((id) => waitForContainer(id, accessToken, deadline)));

      const parentParams: Record<string, string> = {
        media_type: "CAROUSEL",
        children: children.join(","),
      };
      if (text) parentParams.text = text;
      containerId = await createContainer(userId, accessToken, parentParams);
    } else {
      const item = input.media[0];
      if (!item) throw new Error("Threads needs at least one photo or video.");

      const params: Record<string, string> =
        item.kind === "video"
          ? { media_type: "VIDEO", video_url: item.url }
          : { media_type: "IMAGE", image_url: item.url };
      if (text) params.text = text;

      containerId = await createContainer(userId, accessToken, params);
    }

    await waitForContainer(containerId, accessToken, deadline);

    // Publish. Not retried: a second threads_publish on a container that already
    // succeeded is how you get a duplicate post.
    const publishUrl = new URL(`${THREADS_BASE}/${userId}/threads_publish`);
    publishUrl.searchParams.set("creation_id", containerId);
    publishUrl.searchParams.set("access_token", accessToken);

    const publishRes = await publishFetch(publishUrl, { method: "POST" });
    if (!publishRes.ok) throw new Error(await threadsError(publishRes));
    const { id: mediaId } = (await publishRes.json()) as { id?: string };
    if (!mediaId) throw new Error("Threads did not return a published post id.");

    // Permalink is best-effort — failure here doesn't fail the post.
    let permalink: string | null = null;
    try {
      const permaUrl = new URL(`${THREADS_BASE}/${mediaId}`);
      permaUrl.searchParams.set("fields", "permalink");
      permaUrl.searchParams.set("access_token", accessToken);
      const permaRes = await publishFetch(permaUrl, {}, { retries: 1 });
      if (permaRes.ok) {
        const data = (await permaRes.json()) as { permalink?: string };
        permalink = data.permalink ?? null;
      }
    } catch {
      // ignore — we already have the post id
    }

    return { remoteId: mediaId, remoteUrl: permalink };
  },
};

/**
 * Refresh a long-lived Threads token. They last 60 days, can be refreshed once
 * they're at least 24h old, and expire for good if not refreshed within 60 days
 * — so the nightly refresh-tokens cron is what keeps a connection alive.
 */
export async function refreshThreadsToken(accessToken: string): Promise<{
  accessToken: string;
  expiresInSeconds: number;
}> {
  const url = new URL("https://graph.threads.net/refresh_access_token");
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const res = await publishFetch(url, {}, { retries: 1 });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Threads token refresh failed: ${json.error?.message ?? res.status}`);
  }

  return {
    accessToken: json.access_token,
    // 60 days, per the Threads long-lived token docs.
    expiresInSeconds: json.expires_in ?? 60 * 24 * 60 * 60,
  };
}
