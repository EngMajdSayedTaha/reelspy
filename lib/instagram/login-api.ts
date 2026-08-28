// Instagram Graph API via INSTAGRAM LOGIN (graph.instagram.com) — Meta's
// "Instagram API with Instagram Login" product.
//
// This is the flow for a creator whose Instagram Business/Creator account has
// NO linked Facebook Page. graph-api.ts's Facebook Login flow requires one
// (it looks up the IG account through /me/accounts, a Facebook Pages edge);
// this flow authenticates directly against Instagram and needs no Page at all.
//
// Trade-off, not a bug: this flow CANNOT do Business Discovery (reading OTHER
// public Business/Creator accounts) — Meta doesn't expose that field on
// graph.instagram.com. It's fine for the creator's OWN account: profile,
// media, insights, and Content Publishing all work here. See
// lib/meta/graph.ts (graphBaseForAuthFlow) for how callers pick the right host
// once a token exists, and graph-api.ts's own header comment for the
// Facebook-Login side of this split.
//
// A token minted here is NOT valid against graph.facebook.com, and vice versa
// — they are different OAuth audiences. Never mix the two hosts for one token.

import { getSiteUrl } from "@/lib/site";
import {
  IG_LOGIN_AUTHORIZE_BASE,
  IG_LOGIN_GRAPH_BASE,
  IG_LOGIN_OAUTH_TOKEN_URL,
} from "@/lib/meta/graph";

// Mirrors getMetaRedirectUri() in graph-api.ts: must be an EXACT match between
// the authorize step and the token exchange, and must be listed under this
// Instagram app's "Valid OAuth Redirect URIs" in the Meta App Dashboard. This
// is a SEPARATE redirect URI from the Facebook-Login flow's — they are
// different products in the Meta app and Meta validates them independently.
export function getInstagramLoginRedirectUri(): string {
  const explicit = process.env.INSTAGRAM_REDIRECT_URI?.trim();
  return explicit || `${getSiteUrl()}/api/ig/login/callback`;
}

const REQUEST_TIMEOUT_MS = Number(process.env.META_GRAPH_TIMEOUT_MS) || 15_000;

type InstagramLoginConnectUrlParams = {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string;
};

// Builds the Instagram Login consent-dialog URL. Unlike Facebook Login for
// Business, this flow has no "config_id" concept — permissions are always the
// explicit `scope` list.
export function buildInstagramLoginConnectUrl(params: InstagramLoginConnectUrlParams): string {
  const url = new URL(`${IG_LOGIN_AUTHORIZE_BASE}/oauth/authorize`);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scopes);
  url.searchParams.set("state", params.state);
  return url.toString();
}

async function fetchJson<T>(url: URL | string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Instagram Login API error (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export type InstagramLoginShortToken = { accessToken: string; igUserId: string };

// Exchange the OAuth code for a short-lived Instagram user token (~1 hour).
// This one hop is a POST with a form body — unlike every other exchange in
// this module (and unlike the Facebook Login flow), Meta rejects this as
// query params.
export async function exchangeInstagramLoginCode(code: string): Promise<InstagramLoginShortToken> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Missing INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET.");
  }

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    // MUST match the redirect_uri used in the authorize step exactly.
    redirect_uri: getInstagramLoginRedirectUri(),
    code,
  });

  const json = await fetchJson<{ access_token: string; user_id: number | string }>(
    IG_LOGIN_OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  return { accessToken: json.access_token, igUserId: String(json.user_id) };
}

export type LongLivedInstagramToken = { accessToken: string; expiresInSeconds?: number };

// Exchange a short-lived Instagram token for a long-lived one (~60 days).
export async function exchangeForLongLivedInstagramToken(
  token: string
): Promise<LongLivedInstagramToken> {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    throw new Error("Missing INSTAGRAM_APP_SECRET.");
  }

  const url = new URL(`${IG_LOGIN_GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", token);

  const json = await fetchJson<{ access_token: string; expires_in?: number }>(url);
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

// Refresh an existing long-lived token before it expires — resets the ~60-day
// window. Used by the token-refresh cron. Distinct from the exchange above:
// this one takes NO client secret (the long-lived token itself authorizes the
// refresh) and uses `ig_refresh_token`, not `ig_exchange_token`.
export async function refreshLongLivedInstagramToken(
  token: string
): Promise<LongLivedInstagramToken> {
  const url = new URL(`${IG_LOGIN_GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);

  const json = await fetchJson<{ access_token: string; expires_in?: number }>(url);
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

export type InstagramLoginProfile = {
  igUserId: string;
  username: string;
  accountType?: string;
  profilePictureUrl?: string;
};

// The connected account's own profile. `account_type` (BUSINESS/CREATOR/
// PERSONAL) is worth logging even though Meta already refuses non-professional
// accounts the business scopes this flow requests — belt and suspenders.
export async function getInstagramLoginProfile(token: string): Promise<InstagramLoginProfile> {
  const url = new URL(`${IG_LOGIN_GRAPH_BASE}/me`);
  url.searchParams.set("fields", "user_id,username,account_type,profile_picture_url");
  url.searchParams.set("access_token", token);

  const json = await fetchJson<{
    user_id?: string | number;
    username?: string;
    account_type?: string;
    profile_picture_url?: string;
  }>(url);

  return {
    igUserId: String(json.user_id ?? ""),
    username: json.username ?? "unknown",
    accountType: json.account_type,
    profilePictureUrl: json.profile_picture_url,
  };
}
