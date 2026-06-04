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
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
};

export type BusinessDiscoveryProfile = {
  username: string;
  followers_count?: number;
  profile_picture_url?: string;
};

type InstagramConnectUrlParams = {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string;
};

type JsonRecord = Record<string, unknown>;

function toUrl(path: string, searchParams: Record<string, string>) {
  const url = new URL(path);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function buildInstagramConnectUrl(params: InstagramConnectUrlParams) {
  return toUrl("https://api.instagram.com/oauth/authorize", {
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    scope: params.scopes,
    response_type: "code",
    state: params.state,
  }).toString();
}

async function fetchJson<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Instagram API error (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function exchangeCodeForAccessToken(code: string) {
  const appId = process.env.META_IG_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error("Missing META_IG_APP_ID/META_APP_ID, META_APP_SECRET, or META_REDIRECT_URI.");
  }

  const formData = new URLSearchParams();
  formData.set("client_id", appId);
  formData.set("client_secret", appSecret);
  formData.set("grant_type", "authorization_code");
  formData.set("redirect_uri", redirectUri);
  formData.set("code", code);

  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Instagram OAuth exchange failed (${response.status}): ${body}`);
  }

  const json = (await response.json()) as {
    access_token: string;
    user_id: number;
  };

  return {
    accessToken: json.access_token,
    igUserId: String(json.user_id),
  };
}

export async function exchangeForLongLivedToken(token: string) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    throw new Error("Missing META_APP_SECRET.");
  }

  const url = toUrl("https://graph.instagram.com/access_token", {
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: token,
  });

  const json = await fetchJson<{ access_token: string }>(url);
  return json.access_token;
}

export async function getMyProfile(igUserId: string, token: string) {
  const url = toUrl("https://graph.instagram.com/me", {
    fields: "id,username,account_type,media_count",
    access_token: token,
  });

  const json = await fetchJson<JsonRecord>(url);

  return {
    id: String(json.id ?? igUserId),
    username: String(json.username ?? "unknown"),
  } satisfies InstagramProfile;
}

// Business Discovery API — requires Instagram Login token + target account must be Business/Creator.
// Uses graph.instagram.com (Instagram API with Instagram Login).
export async function fetchBusinessDiscovery(
  myIgUserId: string,
  token: string,
  targetUsername: string
): Promise<{ profile: BusinessDiscoveryProfile | null; error?: string }> {
  const url = toUrl(`https://graph.instagram.com/v23.0/${myIgUserId}`, {
    fields: "business_discovery.fields(username,followers_count,profile_picture_url)",
    username: targetUsername,
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
        followers_count: typeof discovery.followers_count === "number" ? discovery.followers_count : undefined,
        profile_picture_url: typeof discovery.profile_picture_url === "string" ? discovery.profile_picture_url : undefined,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("(100)") || message.includes("OAuthException")) {
      return { profile: null, error: "Account not found or not a Business/Creator account." };
    }
    return { profile: null, error: message };
  }
}

// Fetches reels (VIDEO media) from a target account via Business Discovery.
// Uses graph.instagram.com (Instagram API with Instagram Login).
export async function fetchAccountReels(
  myIgUserId: string,
  token: string,
  targetUsername: string
): Promise<{ reels: InstagramMedia[]; error?: string }> {
  const url = toUrl(`https://graph.instagram.com/v23.0/${myIgUserId}`, {
    fields:
      "business_discovery.fields(media.limit(25){id,caption,permalink,timestamp,comments_count,like_count,media_type,thumbnail_url})",
    username: targetUsername,
    access_token: token,
  });

  try {
    const json = await fetchJson<JsonRecord>(url);
    const discovery = json.business_discovery as JsonRecord | undefined;
    const media = discovery?.media as JsonRecord | undefined;
    const allMedia = (media?.data as JsonRecord[] | undefined) ?? [];

    // Filter to VIDEO only — reels are returned as media_type VIDEO
    const reels = allMedia
      .filter((item) => {
        const type = String(item.media_type ?? "").toUpperCase();
        return type === "VIDEO" || type === "REELS";
      })
      .map((item) => ({
        id: String(item.id ?? ""),
        caption: typeof item.caption === "string" ? item.caption : undefined,
        permalink: typeof item.permalink === "string" ? item.permalink : undefined,
        thumbnail_url: typeof item.thumbnail_url === "string" ? item.thumbnail_url : undefined,
        timestamp: typeof item.timestamp === "string" ? item.timestamp : undefined,
        like_count: typeof item.like_count === "number" ? item.like_count : 0,
        comments_count: typeof item.comments_count === "number" ? item.comments_count : 0,
        media_type: String(item.media_type ?? "VIDEO"),
      }));

    return { reels };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { reels: [], error: message };
  }
}

export async function getMyRecentMedia(igUserId: string, token: string) {
  const url = toUrl("https://graph.instagram.com/me/media", {
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count",
    access_token: token,
    limit: "25",
  });

  const json = await fetchJson<{ data?: InstagramMedia[] }>(url);
  const media = json.data ?? [];

  return {
    igUserId,
    media,
  };
}

export async function getMyInsights(igUserId: string, token: string) {
  const url = toUrl("https://graph.instagram.com/me", {
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
    profile_picture_url: typeof profile.profile_picture_url === "string" ? profile.profile_picture_url : null,
    insights: [
      { key: "followers_count", value: typeof profile.followers_count === "number" ? profile.followers_count : 0 },
      { key: "media_count", value: typeof profile.media_count === "number" ? profile.media_count : 0 },
    ],
  };
}
