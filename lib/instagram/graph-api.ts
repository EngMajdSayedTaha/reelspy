// Instagram Graph API via FACEBOOK LOGIN (graph.facebook.com).
// This is the ONLY flow that supports Business Discovery (reading other public
// Business/Creator accounts). The Instagram-Login flow (graph.instagram.com) does
// NOT expose the business_discovery field — confirmed by live API test.
//
// Prerequisites for this to work:
//  - Your IG account is Business or Creator
//  - Your IG account is linked to a Facebook Page
//  - The Meta app has the "Facebook Login" product configured
//  - Token is a long-lived Facebook USER token

import { MetaRateLimitError, type MetaRateLimiter } from "./rate-limit";

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type InstagramProfile = {
  id: string;
  username: string;
  profile_picture_url?: string;
  followers_count?: number;
};

export type InstagramMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  view_count?: number;
  media_type?: string;
};

export type BusinessDiscoveryProfile = {
  username: string;
  followers_count?: number;
  profile_picture_url?: string;
};

type FacebookConnectUrlParams = {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string;
  // Facebook Login for Business: permissions come from a saved configuration.
  // When set, config_id is sent and scope is omitted.
  configId?: string;
};

type JsonRecord = Record<string, unknown>;

// Instagram usernames: letters, digits, dots, underscores, max 30 chars. The
// username is interpolated into the Graph API `fields` expression
// (business_discovery.username(...)), so anything outside this alphabet must be
// rejected to prevent injecting extra fields/arguments into the query.
const IG_USERNAME_RE = /^[a-z0-9._]{1,30}$/i;

export function isValidIgUsername(username: string): boolean {
  return IG_USERNAME_RE.test(username);
}

function toUrl(path: string, searchParams: Record<string, string>) {
  const url = new URL(path);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return url;
}

// Builds the Facebook Login OAuth dialog URL.
// Facebook Login for Business → pass config_id (permissions defined by the config).
// Classic Facebook Login → pass scope.
export function buildInstagramConnectUrl(params: FacebookConnectUrlParams) {
  const query: Record<string, string> = {
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    state: params.state,
  };

  if (params.configId) {
    query.config_id = params.configId;
  } else {
    query.scope = params.scopes;
  }

  return toUrl(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`, query).toString();
}

// When a `limiter` is supplied, every call passes through the shared app-level
// guard: acquire() before the request (may throw MetaRateLimitError), observe()
// after to feed Meta's usage headers back into the circuit breaker.
async function fetchJson<T>(
  url: URL,
  init?: RequestInit,
  limiter?: MetaRateLimiter
): Promise<T> {
  await limiter?.acquire();

  const response = await fetch(url, { ...init, cache: "no-store" });

  if (limiter) {
    await limiter.observe(response.headers, response.status);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Instagram API error (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

// Exchange the OAuth code for a short-lived Facebook user token.
export async function exchangeCodeForAccessToken(code: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error("Missing META_APP_ID, META_APP_SECRET, or META_REDIRECT_URI.");
  }

  const url = toUrl(`${GRAPH_BASE}/oauth/access_token`, {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const json = await fetchJson<{ access_token: string }>(url);
  return json.access_token;
}

export type LongLivedToken = { accessToken: string; expiresInSeconds?: number };

// Exchange a short-lived Facebook token for a long-lived one (~60 days). Also
// used to REFRESH an existing long-lived token: re-running fb_exchange_token
// before expiry returns a fresh token with a reset ~60-day window.
export async function exchangeForLongLivedToken(token: string): Promise<LongLivedToken> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Missing META_APP_ID or META_APP_SECRET.");
  }

  const url = toUrl(`${GRAPH_BASE}/oauth/access_token`, {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: token,
  });

  const json = await fetchJson<{ access_token: string; expires_in?: number }>(url);
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

// Detects a dead/invalid token (revoked, expired, password change). On these we
// stop using the token and flag the user to reconnect, rather than retrying.
export function isInvalidTokenError(message: string): boolean {
  return (
    /\(#?190\)/.test(message) ||
    /error validating access token/i.test(message) ||
    /session has been invalidated/i.test(message) ||
    /access token.*expired/i.test(message) ||
    /code\\?":\s*190/.test(message)
  );
}

// Find the Instagram Business account linked to the user's Facebook Pages.
// Also returns the linking Page's credentials: private replies (Auto-Reply
// module) are sent with the PAGE token, not the user token. A page token
// derived from a long-lived user token does not expire on its own.
export async function getInstagramBusinessAccount(token: string): Promise<{
  igUserId: string;
  username: string;
  profilePictureUrl?: string;
  pageId?: string;
  pageName?: string;
  pageAccessToken?: string;
} | null> {
  const url = toUrl(`${GRAPH_BASE}/me/accounts`, {
    fields: "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
    access_token: token,
  });

  const json = await fetchJson<{ data?: JsonRecord[] }>(url);
  const pages = json.data ?? [];

  for (const page of pages) {
    const iga = page.instagram_business_account as JsonRecord | undefined;
    if (iga?.id) {
      return {
        igUserId: String(iga.id),
        username: String(iga.username ?? "unknown"),
        profilePictureUrl:
          typeof iga.profile_picture_url === "string" ? iga.profile_picture_url : undefined,
        pageId: typeof page.id === "string" ? page.id : undefined,
        pageName: typeof page.name === "string" ? page.name : undefined,
        pageAccessToken: typeof page.access_token === "string" ? page.access_token : undefined,
      };
    }
  }

  return null;
}

// ── Own-account media + insights (My IG page) ───────────────────────────────
// These read the CONNECTED creator's media — not Business Discovery — so they
// don't consume the shared discovery budget, but they still count toward Meta's
// app usage, hence the pacing in the route that calls them.

export type MyMediaItem = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

// Pages through /{ig-user-id}/media until `maxItems` items are collected.
export async function getMyMediaPaged(
  igUserId: string,
  token: string,
  maxItems = 60
): Promise<MyMediaItem[]> {
  const items: MyMediaItem[] = [];
  let url: URL | null = toUrl(`${GRAPH_BASE}/${igUserId}/media`, {
    fields:
      "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count",
    access_token: token,
    limit: "50",
  });

  while (url && items.length < maxItems) {
    const json: { data?: MyMediaItem[]; paging?: { next?: string } } = await fetchJson(url);
    for (const item of json.data ?? []) {
      if (item?.id) items.push(item);
      if (items.length >= maxItems) break;
    }
    url = json.paging?.next && items.length < maxItems ? new URL(json.paging.next) : null;
  }

  return items;
}

export type MediaInsights = {
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saved?: number;
  total_interactions?: number;
  /** Average watch time in milliseconds (reels only). */
  avg_watch_time_ms?: number;
};

const REEL_INSIGHT_METRICS =
  "views,reach,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time";
const POST_INSIGHT_METRICS = "views,reach,likes,comments,shares,saved,total_interactions";

type InsightEntry = { name?: string; values?: Array<{ value?: number }> };

function mapInsights(entries: InsightEntry[]): MediaInsights {
  const out: MediaInsights = {};
  for (const entry of entries) {
    const value = entry.values?.[0]?.value;
    if (typeof value !== "number") continue;
    switch (entry.name) {
      case "views": out.views = value; break;
      case "reach": out.reach = value; break;
      case "likes": out.likes = value; break;
      case "comments": out.comments = value; break;
      case "shares": out.shares = value; break;
      case "saved": out.saved = value; break;
      case "total_interactions": out.total_interactions = value; break;
      case "ig_reels_avg_watch_time": out.avg_watch_time_ms = value; break;
    }
  }
  return out;
}

// Some metrics aren't supported on every media generation — failed items are
// retried with this lean set before degrading to basic like/comment counts.
const LEAN_INSIGHT_METRICS = "reach,total_interactions";

export type BatchInsightsResult = {
  /** mediaId → insights, or null when Meta declined for that item. */
  insights: Map<string, MediaInsights | null>;
  /** True when Meta started throttling partway through — results are partial. */
  rateLimited: boolean;
};

// Per-media insights for MANY items in one round-trip via the Graph batch
// endpoint (up to 50 sub-requests per HTTP call). This replaces N sequential
// /insights calls — same quota cost per sub-request, but latency collapses
// from ~N×500ms to one or two round-trips. Items whose full metric set is
// rejected (older media generations) are retried once with the lean set.
export async function getMediaInsightsBatch(
  items: Array<{ id: string; isReel: boolean }>,
  token: string
): Promise<BatchInsightsResult> {
  const insights = new Map<string, MediaInsights | null>();
  let rateLimited = false;

  const BATCH_LIMIT = 50;

  let pending = items.map((item) => ({
    id: item.id,
    metrics: item.isReel ? REEL_INSIGHT_METRICS : POST_INSIGHT_METRICS,
  }));

  // Pass 0: full metrics. Pass 1: lean retry for the items pass 0 rejected.
  for (let pass = 0; pass < 2 && pending.length > 0 && !rateLimited; pass++) {
    const failed: typeof pending = [];

    for (let i = 0; i < pending.length && !rateLimited; i += BATCH_LIMIT) {
      const chunk = pending.slice(i, i + BATCH_LIMIT);
      const batch = chunk.map((p) => ({
        method: "GET",
        relative_url: `${p.id}/insights?metric=${p.metrics}`,
      }));

      const response = await fetch(`${GRAPH_BASE}/`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: token,
          include_headers: "false",
          batch: JSON.stringify(batch),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        if (isRateLimitError(body)) {
          rateLimited = true;
          break;
        }
        throw new Error(`Instagram API error (${response.status}): ${body}`);
      }

      // Each sub-response carries its own status; null means it timed out.
      const results = (await response.json()) as Array<{ code?: number; body?: string } | null>;

      for (let j = 0; j < chunk.length; j++) {
        const sub = results[j];
        if (sub?.code === 200 && sub.body) {
          try {
            const parsed = JSON.parse(sub.body) as { data?: InsightEntry[] };
            insights.set(chunk[j].id, mapInsights(parsed.data ?? []));
            continue;
          } catch {
            // Unparseable body — treat as failed below.
          }
        }
        if (sub?.body && isRateLimitError(sub.body)) {
          rateLimited = true;
        } else {
          failed.push({ id: chunk[j].id, metrics: LEAN_INSIGHT_METRICS });
        }
      }
    }

    pending = rateLimited ? [] : failed;
  }

  // Anything still unresolved degrades to the basic like/comment counts.
  for (const item of items) {
    if (!insights.has(item.id)) insights.set(item.id, null);
  }

  return { insights, rateLimited };
}

export function isMetaRateLimitMessage(message: string): boolean {
  return isRateLimitError(message);
}

// Business Discovery — read a public Business/Creator account's profile.
// Extracts a human-readable message from a thrown Graph API error string
// (which embeds Meta's JSON error body). Prefers Meta's user-facing message.
export function parseGraphError(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(start)) as {
      error?: { message?: string; error_user_msg?: string; error_user_title?: string };
    };
    const e = parsed.error;
    if (!e) return null;
    return e.error_user_msg || e.message || e.error_user_title || null;
  } catch {
    return null;
  }
}

// Detects Meta rate-limit / throttling errors (app or user level). These are
// hourly buckets, so the right response is to back off, not retry immediately.
function isRateLimitError(message: string): boolean {
  return (
    /\(#?4\)/.test(message) ||
    /\(#?17\)/.test(message) ||
    /\(#?32\)/.test(message) ||
    /\(#?613\)/.test(message) ||
    /request limit reached/i.test(message) ||
    /rate limit/i.test(message) ||
    /reduce the amount of data/i.test(message)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchBusinessDiscovery(
  myIgUserId: string,
  token: string,
  targetUsername: string,
  limiter?: MetaRateLimiter
): Promise<{ profile: BusinessDiscoveryProfile | null; error?: string; rateLimited?: boolean }> {
  if (!isValidIgUsername(targetUsername)) {
    return { profile: null, error: "That doesn't look like a valid Instagram username." };
  }

  const url = toUrl(`${GRAPH_BASE}/${myIgUserId}`, {
    fields: `business_discovery.username(${targetUsername}){username,followers_count,profile_picture_url}`,
    access_token: token,
  });

  try {
    const json = await fetchJson<JsonRecord>(url, undefined, limiter);
    const discovery = json.business_discovery as JsonRecord | undefined;
    if (!discovery) {
      return { profile: null, error: "Account not found or not a Business/Creator account." };
    }
    return {
      profile: {
        username: String(discovery.username ?? targetUsername),
        followers_count:
          typeof discovery.followers_count === "number" ? discovery.followers_count : undefined,
        profile_picture_url:
          typeof discovery.profile_picture_url === "string"
            ? discovery.profile_picture_url
            : undefined,
      },
    };
  } catch (err) {
    // The shared guard deferred this call before it left our server.
    if (err instanceof MetaRateLimitError) {
      return { profile: null, error: err.message, rateLimited: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (isRateLimitError(message)) {
      await limiter?.recordThrottle();
      return {
        profile: null,
        error: "Instagram rate limit reached. Wait a bit, then try again.",
        rateLimited: true,
      };
    }
    const friendly = parseGraphError(message);
    if (friendly) {
      return { profile: null, error: friendly };
    }
    if (message.includes("(100)") || message.includes("does not exist")) {
      return {
        profile: null,
        error: `@${targetUsername} not found, private, or not a Business/Creator account.`,
      };
    }
    // Never leak the raw API error to the UI.
    return {
      profile: null,
      error: `@${targetUsername} could not be added. Check the username and try again.`,
    };
  }
}

function mapMediaItem(item: JsonRecord): InstagramMedia {
  return {
    id: String(item.id ?? ""),
    caption: typeof item.caption === "string" ? item.caption : undefined,
    permalink: typeof item.permalink === "string" ? item.permalink : undefined,
    thumbnail_url: typeof item.thumbnail_url === "string" ? item.thumbnail_url : undefined,
    media_url: typeof item.media_url === "string" ? item.media_url : undefined,
    timestamp: typeof item.timestamp === "string" ? item.timestamp : undefined,
    like_count: typeof item.like_count === "number" ? item.like_count : 0,
    comments_count: typeof item.comments_count === "number" ? item.comments_count : 0,
    view_count: typeof item.view_count === "number" ? item.view_count : undefined,
    media_type: String(item.media_type ?? "VIDEO"),
  };
}

function isReel(item: JsonRecord): boolean {
  const type = String(item.media_type ?? "").toUpperCase();
  const product = String(item.media_product_type ?? "").toUpperCase();
  return type === "VIDEO" || product === "REELS";
}

// Business Discovery — read a target account's recent reels (VIDEO media).
// Pages through the media edge with cursors until `maxReels` reels are collected
// or the account has no more media. Instagram caps each page at 25 items.
export async function fetchAccountReels(
  myIgUserId: string,
  token: string,
  targetUsername: string,
  maxReels = 25,
  limiter?: MetaRateLimiter
): Promise<{
  reels: InstagramMedia[];
  error?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}> {
  if (!isValidIgUsername(targetUsername)) {
    return { reels: [], error: "That doesn't look like a valid Instagram username." };
  }

  const mediaFields =
    "id,caption,permalink,timestamp,comments_count,like_count,view_count,media_type,media_product_type,thumbnail_url,media_url";

  const reels: InstagramMedia[] = [];
  const seen = new Set<string>();
  // Over-fetch raw media since non-reel posts get filtered out. Cap total pages
  // so a feed-heavy account can't loop forever.
  const PAGE_SIZE = 25;
  const MAX_PAGES = Math.min(20, Math.ceil((maxReels * 3) / PAGE_SIZE) + 1);

  let after: string | undefined;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const cursor = after ? `.after(${after})` : "";
      const url = toUrl(`${GRAPH_BASE}/${myIgUserId}`, {
        fields: `business_discovery.username(${targetUsername}){media.limit(${PAGE_SIZE})${cursor}{${mediaFields}}}`,
        access_token: token,
      });

      const json = await fetchJson<JsonRecord>(url, undefined, limiter);
      const discovery = json.business_discovery as JsonRecord | undefined;
      const media = discovery?.media as JsonRecord | undefined;
      const pageItems = (media?.data as JsonRecord[] | undefined) ?? [];

      for (const item of pageItems) {
        if (!isReel(item)) continue;
        const mapped = mapMediaItem(item);
        if (!mapped.id || seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        reels.push(mapped);
        if (reels.length >= maxReels) {
          return { reels };
        }
      }

      const paging = media?.paging as JsonRecord | undefined;
      const cursors = paging?.cursors as JsonRecord | undefined;
      const nextAfter = typeof cursors?.after === "string" ? cursors.after : undefined;
      // Stop when there's no next cursor or the page came back empty. The cursor
      // is interpolated into the fields expression, so only accept the opaque
      // token alphabet Meta actually uses — never arbitrary characters.
      if (!nextAfter || !/^[\w=-]+$/.test(nextAfter) || pageItems.length === 0) break;
      after = nextAfter;
      // Gentle pacing between pages to ease Graph API rate limits.
      await sleep(350);
    }

    return { reels };
  } catch (err) {
    // The shared guard deferred this call before it left our server. Keep any
    // reels gathered on earlier pages and surface the precise retry window.
    if (err instanceof MetaRateLimitError) {
      return {
        reels,
        error: reels.length > 0 ? undefined : err.message,
        rateLimited: true,
        retryAfterSeconds: err.retryAfterSeconds,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    const rateLimited = isRateLimitError(message);
    // Meta itself throttled us — trip the shared circuit so other users back off too.
    if (rateLimited) {
      await limiter?.recordThrottle();
    }
    // If we already collected some reels before the error, keep them.
    if (reels.length > 0) {
      return { reels, rateLimited: rateLimited || undefined };
    }
    if (rateLimited) {
      return {
        reels: [],
        error: "Instagram rate limit reached. Wait about an hour, then sync fewer accounts at a time.",
        rateLimited: true,
      };
    }
    return {
      reels: [],
      error: parseGraphError(message) ?? "Could not fetch reels for this account.",
    };
  }
}

export async function getMyRecentMedia(igUserId: string, token: string) {
  const url = toUrl(`${GRAPH_BASE}/${igUserId}/media`, {
    fields:
      "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count",
    access_token: token,
    limit: "25",
  });

  const json = await fetchJson<{ data?: InstagramMedia[] }>(url);
  const media = json.data ?? [];

  return { igUserId, media };
}

export async function getMyInsights(igUserId: string, token: string) {
  const url = toUrl(`${GRAPH_BASE}/${igUserId}`, {
    fields: "id,username,media_count,followers_count,biography,profile_picture_url",
    access_token: token,
  });

  const profile = await fetchJson<JsonRecord>(url);

  return {
    igUserId,
    username: String(profile.username ?? "unknown"),
    followers_count: typeof profile.followers_count === "number" ? profile.followers_count : 0,
    media_count: typeof profile.media_count === "number" ? profile.media_count : 0,
    biography: typeof profile.biography === "string" ? profile.biography : "",
    profile_picture_url:
      typeof profile.profile_picture_url === "string" ? profile.profile_picture_url : null,
    insights: [
      {
        key: "followers_count",
        value: typeof profile.followers_count === "number" ? profile.followers_count : 0,
      },
      {
        key: "media_count",
        value: typeof profile.media_count === "number" ? profile.media_count : 0,
      },
    ],
  };
}
