// Shared types for the multi-platform Publishing module.

export const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "threads"] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

// Human labels for UI + error messages.
export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
};

// Platforms whose tokens live in `social_connections` and are refreshed through
// lib/publishing/oauth-token.ts. Instagram/Facebook keep theirs on `profiles`
// (shared with the Auto-Reply module), which is why they aren't here.
export const OAUTH_PLATFORMS = ["tiktok", "youtube", "threads"] as const;
export type OAuthPlatform = (typeof OAUTH_PLATFORMS)[number];

export function isOAuthPlatform(value: string): value is OAuthPlatform {
  return (OAUTH_PLATFORMS as readonly string[]).includes(value);
}

// A connected social account (row in social_connections). Token fields are
// present only when loaded through the service-role client.
export type SocialConnection = {
  id: string;
  user_id: string;
  platform: Platform;
  account_id: string;
  account_name: string | null;
  account_username: string | null;
  avatar_url: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at: string | null;
  token_status: string;
  scopes?: string | null;
  is_active: boolean;
};

// The shared content for a post (one upload, many targets).
export type PublishContent = {
  title: string | null;
  caption: string | null;
  hashtags: string | null;
};

// How a post's media should be published. `carousel` means "post every slide as
// one multi-item post"; `image`/`video` mean a single slide.
export const MEDIA_KINDS = ["video", "image", "carousel"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export type MediaItemKind = "image" | "video";

// One slide, as the adapters see it: the URL is already signed/publicly
// reachable (lib/publishing/media.ts does the signing).
export type PublishMediaItem = {
  position: number;
  kind: MediaItemKind;
  url: string;
  // TikTok-only alternate URL when no R2 Custom Domain is configured — TikTok's
  // pull_from_url requires a domain-verified host, which the raw R2 endpoint
  // never can be (see lib/storage/r2.ts, presignTikTokUrl). Falls back to `url`
  // when absent; every other platform ignores this field.
  tiktokUrl?: string;
  mimeType: string;
  altText: string | null;
};

// Credentials resolved by the dispatcher and handed to an adapter. Which fields
// are populated depends on the platform (see dispatcher.resolveCredentials).
export type ResolvedCredentials = {
  accessToken: string;
  accountId: string;
  // Facebook Page posting uses a page-scoped token + id.
  pageId?: string;
  pageToken?: string;
  // Handle used to build a permalink the platform's API doesn't return
  // (TikTok returns only a post id).
  accountUsername?: string | null;
};

// TikTok's actual privacy vocabulary (Content Posting API), fetched live per
// creator from /v2/post/publish/creator_info/query/ — never hardcoded, since
// which options a creator sees depends on their TikTok account settings.
export type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

// Options the creator explicitly picks in the TikTok compliance panel
// (T4, 09-platform-access.md). "draft" routes to the inbox/upload endpoint
// (TikTok finishes the post inside its own app) instead of a fully
// API-driven direct post.
export type TikTokPostOptions = {
  privacyLevel: TikTokPrivacyLevel;
  postMode: "direct" | "draft";
  brandedContent: boolean; // paid partnership / third-party brand deal
  brandOrganic: boolean; // creator's own promotional content
  // Photo posts only — lets TikTok pick a soundtrack for the carousel.
  autoAddMusic?: boolean;
};

export type PublishInput = {
  content: PublishContent;
  // Ordered slides, always at least one. Single-media posts use media[0]; a
  // platform that can't do carousels is never given a multi-slide post (the
  // validator blocks that combination before a job is ever created).
  media: PublishMediaItem[];
  mediaKind: MediaKind;
  // Carousel slide to use as the cover (TikTok photo_cover_index).
  coverIndex: number;
  // Video frame (ms) to use as the cover (Instagram thumb_offset). Null = first.
  coverMs: number | null;
  creds: ResolvedCredentials;
  // "public" or "private" — adapters map this to each platform's vocabulary and
  // force the safe value when the app isn't audited yet.
  privacy: string;
  // TikTok-only: the creator's explicit choices from the compliance panel.
  // Absent for other platforms, and falls back to `privacy` if a TikTok job
  // predates this field (e.g. mid-flight at deploy time).
  tiktokOptions?: TikTokPostOptions;
};

export type PublishResult = {
  remoteId: string;
  remoteUrl: string | null;
};

// Every platform adapter implements this.
export interface PlatformAdapter {
  publish(input: PublishInput): Promise<PublishResult>;
}
