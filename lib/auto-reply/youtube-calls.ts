// YouTube Data API v3 calls for the YouTube comment auto-reply module.
//
// Companion to lib/auto-reply/graph-calls.ts (the Meta side). YouTube has no
// push webhooks for comments, so reads are poll-based
// (app/api/cron/poll-youtube-comments). Writing a reply needs the
// `youtube.force-ssl` scope — the upload-only scopes the connect flow
// originally requested are NOT enough, so a reconnect is required.
//
// Quota (default 10,000 units/day): commentThreads.list costs 1 unit,
// comments.insert costs ~50 units. The polling cadence in vercel.json is set
// conservatively so a normal account stays well under the daily budget.

import type { YouTubeComment } from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";

// Thrown by both calls so callers can branch on auth failures (revoked/expired
// token, or the force-ssl scope missing) and mark the connection invalid.
export class YouTubeApiError extends Error {
  readonly status: number;
  readonly isAuthError: boolean;

  constructor(status: number, message: string, isAuthError: boolean) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
    this.isAuthError = isAuthError;
  }
}

type CommentThreadsResponse = {
  items?: Array<{
    snippet?: {
      canReply?: boolean;
      topLevelComment?: {
        id?: string;
        snippet?: {
          textOriginal?: string;
          textDisplay?: string;
          authorDisplayName?: string;
          authorChannelId?: { value?: string };
          publishedAt?: string;
        };
      };
    };
  }>;
  error?: { message?: string };
};

async function readError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: { message?: string } };
    return json.error?.message ?? `${response.status}`;
  } catch {
    return `${response.status}`;
  }
}

// 401 is always an auth failure. 403 from these endpoints is most often an auth
// problem too (insufficientPermissions when the force-ssl scope is missing),
// though it can also be a quota/disabled-comments error — we treat it as auth
// so the connection gets flagged for reconnect, which is the actionable fix.
function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

// Recent top-level comments on one of the user's videos, newest first.
export async function fetchVideoComments(
  videoId: string,
  accessToken: string,
  limit = 50
): Promise<YouTubeComment[]> {
  const url = new URL(`${API_BASE}/commentThreads`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("order", "time");
  url.searchParams.set("maxResults", String(Math.min(Math.max(limit, 1), 100)));
  url.searchParams.set("textFormat", "plainText");

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new YouTubeApiError(response.status, await readError(response), isAuthStatus(response.status));
  }

  const json = (await response.json()) as CommentThreadsResponse;
  const comments: YouTubeComment[] = [];
  for (const item of json.items ?? []) {
    const top = item.snippet?.topLevelComment;
    const snippet = top?.snippet;
    if (!top?.id) continue;
    comments.push({
      id: top.id,
      text: snippet?.textOriginal ?? snippet?.textDisplay ?? "",
      authorName: snippet?.authorDisplayName ?? null,
      authorChannelId: snippet?.authorChannelId?.value ?? null,
      publishedAt: snippet?.publishedAt ?? null,
      canReply: item.snippet?.canReply ?? true,
    });
  }
  return comments;
}

// Post a public reply under a top-level comment. Returns the new reply id.
export async function replyToComment(
  parentCommentId: string,
  text: string,
  accessToken: string
): Promise<string | null> {
  const url = new URL(`${API_BASE}/comments`);
  url.searchParams.set("part", "snippet");

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ snippet: { parentId: parentCommentId, textOriginal: text } }),
  });

  if (!response.ok) {
    throw new YouTubeApiError(response.status, await readError(response), isAuthStatus(response.status));
  }

  const json = (await response.json()) as { id?: string };
  return json.id ?? null;
}
