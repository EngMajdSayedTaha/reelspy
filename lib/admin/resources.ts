import "server-only";

// Allowlisted registry for the generic content browser. A resource is reachable
// from the admin content API ONLY if it appears here, and only the `columns`
// listed are ever selected — so token/secret columns can never leak (the tables
// that hold tokens, social_connections / ig_connections / profiles, are simply
// not registered here). `searchColumn` powers the free-text ILIKE; `deletable`
// gates the DELETE endpoint; `userColumn` is the per-user filter column.

export type ResourceDef = {
  table: string;
  label: string;
  /** Safe columns to select (NEVER include token/secret columns). */
  columns: string[];
  /** Column used for the per-user filter (always "user_id" here). */
  userColumn: string;
  /** Column for free-text ILIKE search, if any. */
  searchColumn?: string;
  /** Default sort column (must be in `columns`). */
  defaultSort: string;
  /** Whether the DELETE endpoint is allowed for this resource. */
  deletable: boolean;
};

export const RESOURCES: Record<string, ResourceDef> = {
  inspiration_accounts: {
    table: "inspiration_accounts",
    label: "Inspiration accounts",
    columns: ["id", "user_id", "ig_username", "display_name", "followers_count", "niche_tags", "is_active", "last_synced_at", "created_at"],
    userColumn: "user_id",
    searchColumn: "ig_username",
    defaultSort: "created_at",
    deletable: true,
  },
  tracked_reels: {
    table: "tracked_reels",
    label: "Tracked reels",
    columns: ["id", "user_id", "account_id", "ig_permalink", "caption", "view_count", "like_count", "comment_count", "transcript_status", "is_discarded", "is_favorite", "posted_at", "created_at"],
    userColumn: "user_id",
    searchColumn: "caption",
    defaultSort: "created_at",
    deletable: true,
  },
  generated_scripts: {
    table: "generated_scripts",
    label: "Generated scripts",
    columns: ["id", "user_id", "reel_id", "hook", "body", "cta", "platform", "status", "scheduled_date", "created_at"],
    userColumn: "user_id",
    searchColumn: "hook",
    defaultSort: "created_at",
    deletable: true,
  },
  saved_hooks: {
    table: "saved_hooks",
    label: "Saved hooks",
    columns: ["id", "user_id", "reel_id", "text", "tags", "source", "created_at"],
    userColumn: "user_id",
    searchColumn: "text",
    defaultSort: "created_at",
    deletable: true,
  },
  reel_automations: {
    table: "reel_automations",
    label: "Reel automations",
    columns: ["id", "user_id", "ig_media_id", "media_caption", "keywords", "match_mode", "is_active", "created_at", "updated_at"],
    userColumn: "user_id",
    searchColumn: "media_caption",
    defaultSort: "created_at",
    deletable: true,
  },
  dm_automations: {
    table: "dm_automations",
    label: "DM automations",
    columns: ["id", "user_id", "keywords", "match_mode", "reply_message", "is_active", "created_at", "updated_at"],
    userColumn: "user_id",
    searchColumn: "reply_message",
    defaultSort: "created_at",
    deletable: true,
  },
  youtube_automations: {
    table: "youtube_automations",
    label: "YouTube automations",
    columns: ["id", "user_id", "connection_id", "video_id", "video_title", "keywords", "match_mode", "is_active", "created_at", "updated_at"],
    userColumn: "user_id",
    searchColumn: "video_title",
    defaultSort: "created_at",
    deletable: true,
  },
  publish_posts: {
    table: "publish_posts",
    label: "Publish posts",
    columns: ["id", "user_id", "title", "caption", "hashtags", "duration_seconds", "status", "scheduled_at", "created_at", "updated_at"],
    userColumn: "user_id",
    searchColumn: "title",
    defaultSort: "created_at",
    deletable: true,
  },
  publish_jobs: {
    table: "publish_jobs",
    label: "Publish jobs",
    columns: ["id", "user_id", "post_id", "connection_id", "platform", "privacy", "status", "remote_url", "error_message", "attempts", "created_at", "updated_at"],
    userColumn: "user_id",
    searchColumn: "error_message",
    defaultSort: "created_at",
    deletable: false, // read-only: a job row is operational state, not user content
  },
};

export function getResource(slug: string | null | undefined): ResourceDef | null {
  if (!slug) return null;
  return RESOURCES[slug] ?? null;
}

// Lightweight list for the resource picker (slug + label + deletable).
export function resourceList(): { slug: string; label: string; deletable: boolean }[] {
  return Object.entries(RESOURCES).map(([slug, def]) => ({
    slug,
    label: def.label,
    deletable: def.deletable,
  }));
}
