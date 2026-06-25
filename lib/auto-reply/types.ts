// Shared types for the Auto-Reply module (keyword-triggered comment-to-DM).

export type MatchMode = "contains" | "exact" | "any";

export type ReelAutomation = {
  id: string;
  user_id: string;
  ig_media_id: string;
  media_caption: string | null;
  media_permalink: string | null;
  media_thumbnail_url: string | null;
  keywords: string[];
  match_mode: MatchMode;
  public_reply_templates: string[];
  dm_message: string;
  dm_link: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AutomationEventStatus = "pending" | "sent" | "failed" | "skipped";

export type AutomationEvent = {
  id: string;
  automation_id: string | null;
  comment_id: string;
  ig_media_id: string | null;
  comment_text: string | null;
  commenter_id: string | null;
  commenter_username: string | null;
  matched_keyword: string | null;
  like_status: AutomationEventStatus;
  like_error: string | null;
  public_reply_status: AutomationEventStatus;
  public_reply_error: string | null;
  dm_status: AutomationEventStatus;
  dm_error: string | null;
  created_at: string;
  processed_at: string | null;
};

// Subset of Meta's `comments` webhook change value that the processor uses.
// https://developers.facebook.com/docs/instagram-platform/webhooks → comments
export type CommentWebhookValue = {
  /** Instagram comment id. */
  id: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
  /** Present when this comment is a reply to another comment. */
  parent_id?: string;
};

export type InstagramWebhookPayload = {
  object?: string;
  entry?: Array<{
    /** IG user id of the account whose media received the comment. */
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: CommentWebhookValue }>;
    /** Instagram Messaging events (DMs) arrive here, not in `changes`. */
    messaging?: MessagingWebhookEvent[];
  }>;
};

// ── DM keyword automations ────────────────────────────────────────────────────

export type DmAutomation = {
  id: string;
  user_id: string;
  keywords: string[];
  match_mode: MatchMode;
  reply_message: string;
  reply_link: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DmAutomationEvent = {
  id: string;
  automation_id: string | null;
  message_id: string;
  sender_id: string | null;
  sender_username: string | null;
  message_text: string | null;
  matched_keyword: string | null;
  reply_status: AutomationEventStatus;
  reply_error: string | null;
  created_at: string;
  processed_at: string | null;
};

// Subset of Meta's Instagram Messaging webhook event used by the DM processor.
// https://developers.facebook.com/docs/messenger-platform/instagram → webhooks
export type MessagingWebhookEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    /** True for messages SENT BY the connected account (incl. our own bot replies). */
    is_echo?: boolean;
    /** Present when the message is a reply to a story — deliberately not handled. */
    reply_to?: { story?: { id?: string; url?: string }; mid?: string };
    attachments?: Array<{ type?: string }>;
  };
};

// ── YouTube comment automations ───────────────────────────────────────────────
// The YouTube analogue of ReelAutomation: link a video to keywords and post a
// public reply when a matching top-level comment appears. Comments-only —
// YouTube has no DMs.

export type YouTubeAutomation = {
  id: string;
  user_id: string;
  connection_id: string | null;
  video_id: string;
  video_title: string | null;
  keywords: string[];
  match_mode: MatchMode;
  public_reply_templates: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type YouTubeAutomationEvent = {
  id: string;
  automation_id: string | null;
  comment_id: string;
  video_id: string | null;
  comment_text: string | null;
  commenter_name: string | null;
  matched_keyword: string | null;
  reply_status: AutomationEventStatus;
  reply_error: string | null;
  created_at: string;
  processed_at: string | null;
};

// A top-level comment on a video, as the processor consumes it.
export type YouTubeComment = {
  /** The top-level comment id — used both as the dedupe lock and the reply parentId. */
  id: string;
  text: string;
  authorName: string | null;
  /** Channel id of the comment's author; lets us skip the owner's own comments. */
  authorChannelId: string | null;
  publishedAt: string | null;
  /** False when the thread is locked / replies disabled. */
  canReply: boolean;
};
