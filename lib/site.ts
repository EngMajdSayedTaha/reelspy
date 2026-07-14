// Canonical site origin (reelspy.dev in production). Single source of truth so
// email links, SEO metadata, and Stripe/OAuth redirects agree — prefer this
// over reading NEXT_PUBLIC_SITE_URL directly. Falls back to the current
// production domain so local/preview builds without the env var still work.

const DEFAULT_SITE_URL = "https://reelspy.dev";

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (explicit || DEFAULT_SITE_URL).replace(/\/+$/, "");
}
