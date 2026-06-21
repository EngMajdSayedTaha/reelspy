// Instagram Reels publisher — Graph API Content Publishing.
//
// Two-step flow (https://developers.facebook.com/docs/instagram-api/guides/content-publishing):
//   1. POST /{ig-user-id}/media   media_type=REELS&video_url=...&caption=...  → container id
//   2. poll  GET /{container-id}?fields=status_code  until FINISHED
//   3. POST /{ig-user-id}/media_publish  creation_id=...  → published media id
//
// `video_url` must be publicly fetchable by Meta — we hand it a short-lived
// signed Storage URL. Requires the `instagram_content_publish` permission
// (App Review) and an IG Professional account linked to a Facebook Page.
// Hard limit: 50 API-published posts per rolling 24h.

import { parseGraphError } from "@/lib/instagram/graph-api";
import type { PlatformAdapter, PublishInput, PublishResult } from "../types";
import { buildCaption } from "../caption";

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Container processing is async on Meta's side; poll with a ceiling so a stuck
// transcode can't hang the request forever.
const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 4000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphError(response: Response): Promise<string> {
  const body = await response.text();
  return parseGraphError(body) ?? `Instagram API error (${response.status})`;
}

export const instagramAdapter: PlatformAdapter = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const { accountId: igUserId, accessToken } = input.creds;
    const caption = buildCaption(input.content);

    // 1. Create the media container.
    const createUrl = new URL(`${GRAPH_BASE}/${igUserId}/media`);
    createUrl.searchParams.set("media_type", "REELS");
    createUrl.searchParams.set("video_url", input.signedVideoUrl);
    if (caption) createUrl.searchParams.set("caption", caption);
    createUrl.searchParams.set("access_token", accessToken);

    const createRes = await fetch(createUrl, { method: "POST", cache: "no-store" });
    if (!createRes.ok) throw new Error(await graphError(createRes));
    const { id: containerId } = (await createRes.json()) as { id?: string };
    if (!containerId) throw new Error("Instagram did not return a media container id.");

    // 2. Wait for the container to finish processing.
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);
      const statusUrl = new URL(`${GRAPH_BASE}/${containerId}`);
      statusUrl.searchParams.set("fields", "status_code");
      statusUrl.searchParams.set("access_token", accessToken);

      const statusRes = await fetch(statusUrl, { cache: "no-store" });
      if (!statusRes.ok) throw new Error(await graphError(statusRes));
      const { status_code } = (await statusRes.json()) as { status_code?: string };

      if (status_code === "FINISHED") break;
      if (status_code === "ERROR" || status_code === "EXPIRED") {
        throw new Error(`Instagram could not process the video (${status_code}).`);
      }
      if (i === MAX_POLLS - 1) {
        throw new Error("Instagram is still processing the video. Try again shortly.");
      }
    }

    // 3. Publish the finished container.
    const publishUrl = new URL(`${GRAPH_BASE}/${igUserId}/media_publish`);
    publishUrl.searchParams.set("creation_id", containerId);
    publishUrl.searchParams.set("access_token", accessToken);

    const publishRes = await fetch(publishUrl, { method: "POST", cache: "no-store" });
    if (!publishRes.ok) throw new Error(await graphError(publishRes));
    const { id: mediaId } = (await publishRes.json()) as { id?: string };
    if (!mediaId) throw new Error("Instagram did not return a published media id.");

    // Resolve the permalink (best-effort — failure here doesn't fail the post).
    let permalink: string | null = null;
    try {
      const permaUrl = new URL(`${GRAPH_BASE}/${mediaId}`);
      permaUrl.searchParams.set("fields", "permalink");
      permaUrl.searchParams.set("access_token", accessToken);
      const permaRes = await fetch(permaUrl, { cache: "no-store" });
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
