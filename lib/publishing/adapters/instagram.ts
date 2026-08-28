// Instagram publisher — Graph API Content Publishing.
//
// Three shapes, one flow (developers.facebook.com/docs/instagram-platform/content-publishing):
//   single video  → POST /{ig-user-id}/media  media_type=REELS&video_url=…
//   single image  → POST /{ig-user-id}/media  image_url=…&alt_text=…
//   carousel      → one child container per slide (is_carousel_item=true), then
//                   POST /media media_type=CAROUSEL&children=id1,id2,… (2–10)
// then in every case: poll the container until FINISHED, and
// POST /{ig-user-id}/media_publish creation_id=… → published media id.
//
// `image_url`/`video_url` must be publicly fetchable by Meta — we hand it a
// short-lived signed R2 URL. Requires `instagram_content_publish` (App Review)
// and an IG Professional account linked to a Facebook Page.
//
// Documented limits, enforced or surfaced here: 50 API-published posts per
// rolling 24h (a carousel counts as ONE), 400 containers per 24h, and
// containers expire after 24h.

import { parseGraphError } from "@/lib/instagram/graph-api";
import { GRAPH_BASE } from "@/lib/meta/graph";
import { numEnv } from "@/lib/utils/env";

// Content Publishing is supported on BOTH Graph hosts, but a token is only
// valid on the one that minted it (see lib/meta/graph.ts's header comment).
// `input.creds.igGraphBase` (set by the dispatcher from the connection's
// ig_auth_flow) is the source of truth; GRAPH_BASE is only the fallback for
// any caller that predates that field.
import { publishFetch } from "../http";
import type { PlatformAdapter, PublishInput, PublishMediaItem, PublishResult } from "../types";
import { buildCaption } from "../caption";

// Container processing is async on Meta's side; poll with a wall-clock deadline
// so a stuck transcode can't hold the worker. A 10-video carousel polls all of
// its children concurrently against this same budget.
function pollIntervalMs(): number {
  return numEnv("PUBLISH_POLL_INTERVAL_MS", 3000);
}

function containerDeadlineMs(): number {
  return numEnv("PUBLISH_CONTAINER_TIMEOUT_MS", 4 * 60_000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphError(response: Response): Promise<string> {
  const body = await response.text();
  return parseGraphError(body) ?? `Instagram API error (${response.status})`;
}

/**
 * Refuse early when the account is already at its 24h publishing cap. Without
 * this the post fails deep inside media_publish with a generic Graph error and
 * the user is told to "retry" something that cannot succeed for hours.
 * Best-effort: a failure to READ the limit never blocks a publish.
 */
async function assertWithinPublishingLimit(
  igUserId: string,
  accessToken: string,
  graphBase: string
): Promise<void> {
  try {
    const url = new URL(`${graphBase}/${igUserId}/content_publishing_limit`);
    url.searchParams.set("fields", "config,quota_usage");
    url.searchParams.set("access_token", accessToken);

    const res = await publishFetch(url, {}, { retries: 1 });
    if (!res.ok) return;
    const body = (await res.json()) as {
      data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }>;
    };
    const row = body.data?.[0];
    const used = row?.quota_usage;
    const total = row?.config?.quota_total;
    if (typeof used === "number" && typeof total === "number" && total > 0 && used >= total) {
      throw new InstagramQuotaError(used, total);
    }
  } catch (error) {
    if (error instanceof InstagramQuotaError) throw error;
    // Any other failure here is diagnostic noise, not a reason to block.
  }
}

class InstagramQuotaError extends Error {
  constructor(used: number, total: number) {
    super(
      `Instagram's 24-hour publishing limit is used up (${used}/${total} posts). Try again later — the limit is a rolling 24h window.`
    );
    this.name = "InstagramQuotaError";
  }
}

/** Create one container and return its id. Never retried — it creates state. */
async function createContainer(
  igUserId: string,
  accessToken: string,
  params: Record<string, string>,
  graphBase: string
): Promise<string> {
  const url = new URL(`${graphBase}/${igUserId}/media`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", accessToken);

  const res = await publishFetch(url, { method: "POST" });
  if (!res.ok) throw new Error(await graphError(res));
  const { id } = (await res.json()) as { id?: string };
  if (!id) throw new Error("Instagram did not return a media container id.");
  return id;
}

/** Poll one container until Meta says it's ready to publish. */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  deadline: number,
  graphBase: string
): Promise<void> {
  for (;;) {
    await sleep(pollIntervalMs());

    const url = new URL(`${graphBase}/${containerId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", accessToken);

    const res = await publishFetch(url, {}, { retries: 2 });
    if (!res.ok) throw new Error(await graphError(res));
    const { status_code } = (await res.json()) as { status_code?: string };

    if (status_code === "FINISHED" || status_code === "PUBLISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new Error(`Instagram could not process the media (${status_code}).`);
    }
    if (Date.now() > deadline) {
      throw new Error("Instagram is still processing the media. It will be retried shortly.");
    }
  }
}

/** The params for one carousel child. Children carry no caption of their own. */
function childParams(item: PublishMediaItem): Record<string, string> {
  const params: Record<string, string> = { is_carousel_item: "true" };
  if (item.kind === "video") {
    params.media_type = "VIDEO";
    params.video_url = item.url;
  } else {
    params.image_url = item.url;
  }
  return params;
}

export const instagramAdapter: PlatformAdapter = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const { accountId: igUserId, accessToken, igGraphBase } = input.creds;
    const graphBase = igGraphBase ?? GRAPH_BASE;
    const caption = buildCaption(input.content);
    const deadline = Date.now() + containerDeadlineMs();

    await assertWithinPublishingLimit(igUserId, accessToken, graphBase);

    let containerId: string;

    if (input.mediaKind === "carousel") {
      // Build every child first, then wait on all of them together — a serial
      // poll per child would multiply a 10-slide carousel's wall time by 10.
      const children = await Promise.all(
        input.media.map((item) => createContainer(igUserId, accessToken, childParams(item), graphBase))
      );
      await Promise.all(children.map((id) => waitForContainer(id, accessToken, deadline, graphBase)));

      const parentParams: Record<string, string> = {
        media_type: "CAROUSEL",
        children: children.join(","),
      };
      if (caption) parentParams.caption = caption;
      containerId = await createContainer(igUserId, accessToken, parentParams, graphBase);
    } else {
      const item = input.media[0];
      if (!item) throw new Error("Instagram needs at least one photo or video.");

      const params: Record<string, string> = {};
      if (item.kind === "video") {
        params.media_type = "REELS";
        params.video_url = item.url;
        // Cover frame the creator scrubbed to in the composer.
        if (input.coverMs != null && input.coverMs > 0) {
          params.thumb_offset = String(Math.round(input.coverMs));
        }
      } else {
        params.image_url = item.url;
        // alt_text is documented for single image posts only — Meta rejects it
        // on reels and stories, and it is not part of the carousel child spec,
        // so it is deliberately sent here and nowhere else.
        if (item.altText?.trim()) params.alt_text = item.altText.trim();
      }
      if (caption) params.caption = caption;

      containerId = await createContainer(igUserId, accessToken, params, graphBase);
    }

    await waitForContainer(containerId, accessToken, deadline, graphBase);

    // Publish the finished container. Not retried: a second media_publish on a
    // container that already succeeded is how you get a duplicate post.
    const publishUrl = new URL(`${graphBase}/${igUserId}/media_publish`);
    publishUrl.searchParams.set("creation_id", containerId);
    publishUrl.searchParams.set("access_token", accessToken);

    const publishRes = await publishFetch(publishUrl, { method: "POST" });
    if (!publishRes.ok) throw new Error(await graphError(publishRes));
    const { id: mediaId } = (await publishRes.json()) as { id?: string };
    if (!mediaId) throw new Error("Instagram did not return a published media id.");

    // Resolve the permalink (best-effort — failure here doesn't fail the post).
    let permalink: string | null = null;
    try {
      const permaUrl = new URL(`${graphBase}/${mediaId}`);
      permaUrl.searchParams.set("fields", "permalink");
      permaUrl.searchParams.set("access_token", accessToken);
      const permaRes = await publishFetch(permaUrl, {}, { retries: 1 });
      if (permaRes.ok) {
        const data = (await permaRes.json()) as { permalink?: string };
        permalink = data.permalink ?? null;
      }
    } catch {
      // ignore — we already have the media id
    }

    return { remoteId: mediaId, remoteUrl: permalink };
  },
};
