// Shared types for the multi-platform Publishing module.

export const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube"] as const;
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
};

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

// Credentials resolved by the dispatcher and handed to an adapter. Which fields
// are populated depends on the platform (see dispatcher.resolveCredentials).
export type ResolvedCredentials = {
  accessToken: string;
  accountId: string;
  // Facebook Page posting uses a page-scoped token + id.
  pageId?: string;
  pageToken?: string;
};

export type PublishInput = {
  content: PublishContent;
  // Short-lived signed URL to the uploaded video in Storage.
  signedVideoUrl: string;
  creds: ResolvedCredentials;
  // "public" or "private" — adapters map this to each platform's vocabulary and
  // force the safe value when the app isn't audited yet.
  privacy: string;
};

export type PublishResult = {
  remoteId: string;
  remoteUrl: string | null;
};

// Every platform adapter implements this.
export interface PlatformAdapter {
  publish(input: PublishInput): Promise<PublishResult>;
}
