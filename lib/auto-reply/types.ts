// Shared types for the Auto-Reply module (keyword-triggered comment-to-DM).

export type MatchMode = "contains" | "exact";

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
  }>;
};
