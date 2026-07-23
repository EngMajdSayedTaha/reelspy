import { getSiteUrl } from "@/lib/site";

// The OAuth redirect URI each publishing provider (TikTok, YouTube) returns to
// after its consent screen. Like Meta's getMetaRedirectUri, this must be an
// EXACT, pre-registered string and must be identical in the authorize step
// (connect route) and the token exchange (callback route) — so both read it
// from here.
//
// It defaults to the canonical site origin (reelspy.dev via getSiteUrl) + the
// platform's callback path, so it always tracks the domain the app is served on
// instead of a hardcoded env that drifts to an old *.vercel.app host and drops
// the user there after connecting. TIKTOK_REDIRECT_URI / YOUTUBE_REDIRECT_URI
// still override for local dev. Whatever this resolves to must be registered in
// the provider console (TikTok redirect URI / Google authorized redirect URI).
const ENV_KEY: Record<"tiktok" | "youtube", string> = {
  tiktok: "TIKTOK_REDIRECT_URI",
  youtube: "YOUTUBE_REDIRECT_URI",
};

export function getSocialRedirectUri(platform: "tiktok" | "youtube"): string {
  const explicit = process.env[ENV_KEY[platform]]?.trim();
  return explicit || `${getSiteUrl()}/api/social/${platform}/callback`;
}
