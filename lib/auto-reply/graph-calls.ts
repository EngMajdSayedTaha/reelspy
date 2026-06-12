// Graph API WRITE calls for the Auto-Reply module.
//
// Kept out of lib/instagram/graph-api.ts on purpose: that client is the
// read-only Business Discovery layer. Errors are thrown in the exact same
// "Instagram API error (status): body" shape so the shared helpers
// (parseGraphError, isInvalidTokenError, isMetaRateLimitMessage) work on them.
//
// Required Meta permissions (granted on reconnect, see app/api/ig/connect):
//   - instagram_manage_comments  → replyToComment, fetchRecentComments
//   - instagram_manage_messages + pages_messaging → sendPrivateReply
//   - pages_manage_metadata      → subscribePageToWebhooks

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram API error (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

// Public reply under a comment. Uses the long-lived USER token.
// Returns the new reply's comment id.
export async function replyToComment(
  commentId: string,
  message: string,
  userToken: string
): Promise<string | null> {
  const json = await postJson<{ id?: string }>(`${GRAPH_BASE}/${commentId}/replies`, {
    message,
    access_token: userToken,
  });
  return json.id ?? null;
}

// Private reply: DM the comment's author. Uses the PAGE token, and Meta allows
// exactly one private reply per comment, within 7 days of the comment.
export async function sendPrivateReply(
  pageId: string,
  commentId: string,
  text: string,
  pageToken: string
): Promise<string | null> {
  const json = await postJson<{ message_id?: string }>(`${GRAPH_BASE}/${pageId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text },
    access_token: pageToken,
  });
  return json.message_id ?? null;
}

// Page-level app subscription — without it Meta delivers NO Instagram webhooks
// for this account, even when the app-level webhook is configured. The
// `comments` field itself is selected on the Instagram object in the App
// Dashboard; `subscribed_fields` here only accepts Page fields, so `feed` is
// the conventional minimal value.
export async function subscribePageToWebhooks(
  pageId: string,
  pageToken: string
): Promise<void> {
  await postJson(`${GRAPH_BASE}/${pageId}/subscribed_apps`, {
    subscribed_fields: "feed",
    access_token: pageToken,
  });
}

export type RecentComment = {
  id: string;
  text?: string;
  timestamp?: string;
  parent_id?: string;
  from?: { id?: string; username?: string };
};

// Recent top-level comments on one of the user's OWN media items. Used by the
// polling fallback (app/api/cron/poll-comments) when webhook delivery is off.
export async function fetchRecentComments(
  mediaId: string,
  userToken: string,
  limit = 25
): Promise<RecentComment[]> {
  const url = new URL(`${GRAPH_BASE}/${mediaId}/comments`);
  url.searchParams.set("fields", "id,text,timestamp,parent_id,from{id,username}");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", userToken);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram API error (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { data?: RecentComment[] };
  return json.data ?? [];
}
