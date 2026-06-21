// Facebook Page video publisher — Graph API.
//
// POST /{page-id}/videos with `file_url` (Meta pulls the bytes) + `description`,
// using the PAGE access token (not the user token). Requires the
// `pages_manage_posts` permission (App Review). The page id + token come from
// the existing Auto-Reply page credentials (lib/instagram/token-store.ts), which
// the dispatcher resolves into creds.pageId / creds.pageToken.

import { parseGraphError } from "@/lib/instagram/graph-api";
import type { PlatformAdapter, PublishInput, PublishResult } from "../types";
import { buildCaption } from "../caption";

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const facebookAdapter: PlatformAdapter = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const pageId = input.creds.pageId ?? input.creds.accountId;
    const pageToken = input.creds.pageToken ?? input.creds.accessToken;
    const description = buildCaption(input.content);

    const url = new URL(`${GRAPH_BASE}/${pageId}/videos`);
    url.searchParams.set("file_url", input.signedVideoUrl);
    if (input.content.title) url.searchParams.set("title", input.content.title);
    if (description) url.searchParams.set("description", description);
    url.searchParams.set("access_token", pageToken);

    const res = await fetch(url, { method: "POST", cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseGraphError(body) ?? `Facebook API error (${res.status})`);
    }

    const { id: videoId } = (await res.json()) as { id?: string };
    if (!videoId) throw new Error("Facebook did not return a video id.");

    return {
      remoteId: videoId,
      remoteUrl: `https://www.facebook.com/${pageId}/videos/${videoId}`,
    };
  },
};
