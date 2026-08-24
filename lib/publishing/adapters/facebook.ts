// Facebook Page publisher — Graph API.
//
//   single video → POST /{page-id}/videos  file_url=… (Meta pulls the bytes)
//   single photo → POST /{page-id}/photos  url=…&caption=…&published=true
//   multi-photo  → POST /{page-id}/photos  url=…&published=false  (per photo)
//                  then POST /{page-id}/feed  message=…&attached_media[i]={"media_fbid":…}
//
// All of it uses the PAGE access token (not the user token) and requires
// `pages_manage_posts` (App Review). The page id + token come from the existing
// Auto-Reply page credentials (lib/instagram/token-store.ts), which the
// dispatcher resolves into creds.pageId / creds.pageToken.
//
// Unpublished photos live on Meta's servers for ~24h before being garbage
// collected, so the /feed call has to follow promptly — which it does, since
// both steps run inside one adapter call.

import { parseGraphError } from "@/lib/instagram/graph-api";
import { GRAPH_BASE } from "@/lib/meta/graph";
import { publishFetch } from "../http";
import type { PlatformAdapter, PublishInput, PublishResult } from "../types";
import { buildCaption } from "../caption";

async function graphError(response: Response): Promise<string> {
  const body = await response.text();
  return parseGraphError(body) ?? `Facebook API error (${response.status})`;
}

async function post<T>(base: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);

  // Never retried: every call here creates remote state.
  const res = await publishFetch(url, { method: "POST" });
  if (!res.ok) throw new Error(await graphError(res));
  return (await res.json()) as T;
}

export const facebookAdapter: PlatformAdapter = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const pageId = input.creds.pageId ?? input.creds.accountId;
    const pageToken = input.creds.pageToken ?? input.creds.accessToken;
    const description = buildCaption(input.content);

    if (input.mediaKind === "carousel") {
      // 1. Upload each photo unpublished, collecting its media_fbid.
      const fbids = await Promise.all(
        input.media.map(async (item) => {
          const params: Record<string, string> = { url: item.url, published: "false" };
          if (item.altText?.trim()) params.alt_text_custom = item.altText.trim();
          const { id } = await post<{ id?: string }>(
            `${GRAPH_BASE}/${pageId}/photos`,
            params,
            pageToken
          );
          if (!id) throw new Error("Facebook did not return a photo id.");
          return id;
        })
      );

      // 2. Publish them as one feed post. attached_media is an indexed param,
      //    each value a JSON object — not a JSON array.
      const feedParams: Record<string, string> = {};
      if (description) feedParams.message = description;
      fbids.forEach((fbid, index) => {
        feedParams[`attached_media[${index}]`] = JSON.stringify({ media_fbid: fbid });
      });

      const { id: postId } = await post<{ id?: string }>(
        `${GRAPH_BASE}/${pageId}/feed`,
        feedParams,
        pageToken
      );
      if (!postId) throw new Error("Facebook did not return a post id.");

      return {
        remoteId: postId,
        // /feed returns "{page-id}_{post-id}", which is already the permalink path.
        remoteUrl: `https://www.facebook.com/${postId.replace("_", "/posts/")}`,
      };
    }

    const item = input.media[0];
    if (!item) throw new Error("Facebook needs at least one photo or video.");

    if (item.kind === "image") {
      const params: Record<string, string> = { url: item.url, published: "true" };
      if (description) params.caption = description;
      if (item.altText?.trim()) params.alt_text_custom = item.altText.trim();

      const { id, post_id } = await post<{ id?: string; post_id?: string }>(
        `${GRAPH_BASE}/${pageId}/photos`,
        params,
        pageToken
      );
      if (!id) throw new Error("Facebook did not return a photo id.");

      return {
        remoteId: post_id ?? id,
        remoteUrl: post_id
          ? `https://www.facebook.com/${post_id.replace("_", "/posts/")}`
          : `https://www.facebook.com/${pageId}/photos/${id}`,
      };
    }

    const params: Record<string, string> = { file_url: item.url };
    if (input.content.title) params.title = input.content.title;
    if (description) params.description = description;

    const { id: videoId } = await post<{ id?: string }>(
      `${GRAPH_BASE}/${pageId}/videos`,
      params,
      pageToken
    );
    if (!videoId) throw new Error("Facebook did not return a video id.");

    return {
      remoteId: videoId,
      remoteUrl: `https://www.facebook.com/${pageId}/videos/${videoId}`,
    };
  },
};
