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

async function fetchJson<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });

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

// Exchange a short-lived Facebook token for a long-lived one (~60 days).
export async function exchangeForLongLivedToken(token: string): Promise<string> {
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

  const json = await fetchJson<{ access_token: string }>(url);
  return json.access_token;
}

// Find the Instagram Business account linked to the user's Facebook Pages.
export async function getInstagramBusinessAccount(token: string): Promise<{
  igUserId: string;
  username: string;
  profilePictureUrl?: string;
} | null> {
  const url = toUrl(`${GRAPH_BASE}/me/accounts`, {
    fields: "instagram_business_account{id,username,profile_picture_url}",
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
      };
    }
  }

  return null;
}

export async function getMyProfile(igUserId: string, token: string) {
  const url = toUrl(`${GRAPH_BASE}/${igUserId}`, {
    fields: "id,username,profile_picture_url",
    access_token: token,
  });

  const json = await fetchJson<JsonRecord>(url);

  return {
    id: String(json.id ?? igUserId),
    username: String(json.username ?? "unknown"),
    profile_picture_url:
      typeof json.profile_picture_url === "string" ? json.profile_picture_url : undefined,
  } satisfies InstagramProfile;
}

// Business Discovery — read a public Business/Creator account's profile.
// Extracts a human-readable message from a thrown Graph API error string
// (which embeds Meta's JSON error body). Prefers Meta's user-facing message.
function parseGraphError(raw: string): string | null {
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

export async function fetchBusinessDiscovery(
  myIgUserId: string,
  token: string,
  targetUsername: string
): Promise<{ profile: BusinessDiscoveryProfile | null; error?: string }> {
  const url = toUrl(`${GRAPH_BASE}/${myIgUserId}`, {
    fields: `business_discovery.username(${targetUsername}){username,followers_count,profile_picture_url}`,
    access_token: token,
  });

  try {
    const json = await fetchJson<JsonRecord>(url);
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
    const message = err instanceof Error ? err.message : String(err);
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
  maxReels = 25
): Promise<{ reels: InstagramMedia[]; error?: string }> {
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

      const json = await fetchJson<JsonRecord>(url);
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
      // Stop when there's no next cursor or the page came back empty.
      if (!nextAfter || pageItems.length === 0) break;
      after = nextAfter;
    }

    return { reels };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If we already collected some reels before the error, keep them.
    if (reels.length > 0) {
      return { reels };
    }
    return { reels: [], error: message };
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
