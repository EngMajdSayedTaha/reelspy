// Canonical origin of the PRODUCT (app.reelspy.dev). Single source of truth so
// email links, SEO metadata, and Stripe/OAuth redirects agree — prefer this
// over reading NEXT_PUBLIC_SITE_URL directly. Falls back to the current
// production domain so local/preview builds without the env var still work.
//
// reelspy.dev is the MARKETING origin (the reelspy-landing project) and is not
// this app's home: it still proxies the legal/brand pages and /api here, but the
// authenticated surface lives on the subdomain. Everything derived from this
// value — Stripe return URLs, the Meta/TikTok/YouTube OAuth redirect URIs
// (getMetaRedirectUri, getSocialRedirectUri) — must be registered against the
// subdomain, so changing it means updating those provider consoles too.

const DEFAULT_SITE_URL = "https://app.reelspy.dev";

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (explicit || DEFAULT_SITE_URL).replace(/\/+$/, "");
}
