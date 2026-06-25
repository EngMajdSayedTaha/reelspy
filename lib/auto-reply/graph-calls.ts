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

// Like (heart) a comment. Uses the long-lived USER token.
//
// NOTE: Meta only added comment-liking to the official API in 2026 and the
// docs around it are thin — callers must treat this as best-effort and never
// let a failure block the reply/DM steps. If the endpoint is rejected
// ("nonexisting field"-style errors), the event log captures Meta's message.
export async function likeComment(commentId: string, userToken: string): Promise<void> {
  await postJson(`${GRAPH_BASE}/${commentId}/likes`, {
    access_token: userToken,
  });
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
// `comments`/`messages` fields themselves are selected on the Instagram object
// in the App Dashboard; `subscribed_fields` here only accepts Page fields:
// `feed` covers the comment webhooks, `messages` unlocks Instagram Messaging
// (DM) webhook delivery.
export async function subscribePageToWebhooks(
  pageId: string,
  pageToken: string
): Promise<void> {
  await postJson(`${GRAPH_BASE}/${pageId}/subscribed_apps`, {
    subscribed_fields: "feed,messages",
    access_token: pageToken,
  });
}

// Read back which Page webhook fields THIS app is currently subscribed to, so
// the Automations UI can confirm `messages` (DM delivery) is actually active —
// the #1 reason DM auto-reply silently doesn't fire. Returns the field list for
// our app (matched by META_APP_ID when set, else the first subscription).
export async function getPageSubscribedFields(
  pageId: string,
  pageToken: string
): Promise<string[]> {
  const url = new URL(`${GRAPH_BASE}/${pageId}/subscribed_apps`);
  url.searchParams.set("access_token", pageToken);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram API error (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    data?: Array<{ id?: string; subscribed_fields?: string[] }>;
  };
  const appId = process.env.META_APP_ID;
  const entry = appId ? json.data?.find((d) => d.id === appId) : json.data?.[0];
  return entry?.subscribed_fields ?? [];
}

// Plain DM to an Instagram-scoped user id (the `sender.id` from a messaging
// webhook). Uses the PAGE token. Replying to a just-received message is always
// inside Meta's 24-hour messaging window.
export async function sendDirectMessage(
  pageId: string,
  recipientId: string,
  text: string,
  pageToken: string
): Promise<string | null> {
  const json = await postJson<{ message_id?: string }>(`${GRAPH_BASE}/${pageId}/messages`, {
    recipient: { id: recipientId },
    message: { text },
    access_token: pageToken,
  });
  return json.message_id ?? null;
}

// Best-effort username lookup for the event log (messaging webhooks only carry
// the Instagram-scoped id, not the handle). Callers must tolerate null.
export async function getIgUsernameById(
  igScopedId: string,
  pageToken: string
): Promise<string | null> {
  try {
    const url = new URL(`${GRAPH_BASE}/${igScopedId}`);
    url.searchParams.set("fields", "username");
    url.searchParams.set("access_token", pageToken);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const json = (await response.json()) as { username?: string };
    return typeof json.username === "string" ? json.username : null;
  } catch {
    return null;
  }
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
