// Research platform abstraction (roadmap X5 / H2). A source-agnostic interface
// over "read a public account's profile + recent short-form videos", so the
// research side (snapshots.ts) no longer hard-depends on Instagram Business
// Discovery. Instagram implements it today; a second platform (TikTok) slots in
// behind the same interface.
//
// Client-safe: pure types only, no server-only / network / SDK imports — so this
// can be imported anywhere. Implementations live in ./instagram and ./tiktok.
//
// NOTE (H2 non-negotiable): the snapshot schema stays IG-keyed (`ig_username`).
// We do NOT add a `platform` discriminator column until a second source is
// actually shipped live — the TikTok source here is dormant scaffolding.

export type ResearchPlatform = "instagram" | "tiktok";

// A public creator profile, normalized across platforms.
export type ResearchProfile = {
  username: string;
  displayName?: string | null;
  followersCount?: number | null;
  avatarUrl?: string | null;
};

// A public short-form video (reel / TikTok), normalized across platforms.
export type ResearchReel = {
  externalId: string; // platform-native media id
  permalink?: string | null;
  caption?: string | null;
  thumbnailUrl?: string | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  postedAt?: string | null; // ISO 8601
};

export type ResearchReelsResult = {
  profile?: ResearchProfile;
  reels: ResearchReel[];
  error?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
};

export type ResearchProfileResult = {
  profile: ResearchProfile | null;
  error?: string;
  rateLimited?: boolean;
};

// The platform-agnostic research contract consumed by snapshots.ts.
export interface ResearchSource {
  readonly platform: ResearchPlatform;
  // Whether this source has the credentials/config to actually run. A source
  // that isn't configured returns a clean "unavailable" rather than throwing.
  isConfigured(): boolean;
  // Read a target account's recent short-form videos (+ its current profile,
  // when the platform returns both in one call, as IG Business Discovery does).
  getRecentReels(username: string, maxReels: number): Promise<ResearchReelsResult>;
  // Read just the target account's profile.
  getProfile(username: string): Promise<ResearchProfileResult>;
}
