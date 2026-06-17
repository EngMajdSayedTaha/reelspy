// Public-grid scraper — the collab-reel fallback for Business Discovery.
//
// WHY THIS EXISTS
// Meta's Business Discovery API only returns reels an account PUBLISHED. A
// collab reel (invite-a-collaborator) is owned by ONE account and merely
// mirrored onto every collaborator's grid, so a reel a tracked account only
// co-authored never appears under its Business Discovery media edge — it goes
// missing from the feed. The public profile grid, by contrast, DOES show
// collab posts. This module reads that grid (using the same Instagram cookies
// the transcription path already relies on) purely to recover those collab
// reels.
//
// THIS IS A SUPPLEMENT, NEVER A REPLACEMENT. Business Discovery stays the
// primary source. Grid scraping is best-effort: no cookies, a disabled flag,
// an Instagram block, or a changed JSON shape all degrade silently to "Graph
// only" with zero regression. It is also fragile by nature — we parse
// Instagram's private internal JSON, which they can change without notice — so
// every failure path here is swallowed, and a kill switch (ENABLE_GRID_SCRAPE)
// can turn the whole thing off instantly if Instagram starts pushing back.

import { boolEnv, numEnv } from "@/lib/utils/env";
import { isValidIgUsername } from "./graph-api";

// Instagram's public web app id. Required header for web_profile_info; without
// it the endpoint returns a login wall even with valid cookies.
const IG_APP_ID = "936619743392459";
const WEB_PROFILE_INFO = "https://www.instagram.com/api/v1/users/web_profile_info/";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = numEnv("GRID_SCRAPE_TIMEOUT_MS", 15000);

export type GridReel = {
  /** Media pk — stable across runs, used as ig_media_id for grid-only reels. */
  mediaId: string;
  shortcode: string;
  permalink: string;
  caption: string | null;
  thumbnailUrl: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  /** ISO timestamp, or null when Instagram didn't include one. */
  postedAt: string | null;
  /** Co-author handles (the signal that a reel is a collab). */
  coauthors: string[];
};

export type GridScrapeResult = {
  status: "ok" | "disabled" | "no_cookies" | "error" | "not_found";
  reels: GridReel[];
  error?: string;
};

// Grid scraping is only attempted when explicitly enabled AND cookies exist —
// the endpoint returns a login wall without a logged-in session, so there's no
// point calling it otherwise.
export function gridScrapeEnabled(): boolean {
  return boolEnv("ENABLE_GRID_SCRAPE", true) && Boolean(process.env.YTDLP_COOKIES_B64);
}

// Pulls the shortcode out of any Instagram post/reel permalink. The shortcode
// is the only id format shared between Business Discovery permalinks and grid
// nodes, so it's what we dedup on (Graph media ids and web pks differ).
export function extractShortcode(permalink: string | null | undefined): string | null {
  if (!permalink) return null;
  const m = permalink.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// Parses the base64 Netscape cookies.txt (the same YTDLP_COOKIES_B64 the
// transcription path uses) into a Cookie header for instagram.com, plus the
// csrftoken value Instagram wants echoed back in the x-csrftoken header.
function buildCookieHeader(): { cookie: string; csrftoken: string | null } | null {
  const encoded = process.env.YTDLP_COOKIES_B64;
  if (!encoded) return null;

  let text: string;
  try {
    text = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }

  const pairs: string[] = [];
  let csrftoken: string | null = null;

  for (const rawLine of text.split("\n")) {
    // yt-dlp prefixes httpOnly cookies with "#HttpOnly_"; keep those, drop real
    // comment lines and blanks.
    const line = rawLine.startsWith("#HttpOnly_") ? rawLine.slice("#HttpOnly_".length) : rawLine;
    if (!line || line.startsWith("#")) continue;

    const cols = line.split("\t");
    if (cols.length < 7) continue;

    const domain = cols[0];
    if (!/instagram\.com$/i.test(domain.replace(/^\./, ""))) continue;

    const name = cols[5];
    const value = cols[6].trim();
    if (!name) continue;

    pairs.push(`${name}=${value}`);
    if (name === "csrftoken") csrftoken = value;
  }

  if (pairs.length === 0) return null;
  return { cookie: pairs.join("; "), csrftoken };
}

type TimelineNode = {
  id?: unknown;
  shortcode?: unknown;
  is_video?: unknown;
  product_type?: unknown;
  display_url?: unknown;
  video_view_count?: unknown;
  taken_at_timestamp?: unknown;
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: unknown } }> };
  edge_media_to_comment?: { count?: unknown };
  edge_media_preview_like?: { count?: unknown };
  edge_liked_by?: { count?: unknown };
  coauthor_producers?: Array<{ username?: unknown }>;
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// A grid node is a reel when Instagram marks it as a clip, or failing that when
// it's a video — matching how Business Discovery treats VIDEO media as reels.
function isReelNode(node: TimelineNode): boolean {
  const product = String(node.product_type ?? "").toLowerCase();
  if (product === "clips") return true;
  return node.is_video === true;
}

function mapNode(node: TimelineNode): GridReel | null {
  const mediaId = str(node.id);
  const shortcode = str(node.shortcode);
  if (!mediaId || !shortcode) return null;

  const product = String(node.product_type ?? "").toLowerCase();
  const path = product === "clips" || node.is_video === true ? "reel" : "p";

  const caption = str(node.edge_media_to_caption?.edges?.[0]?.node?.text);
  const ts = node.taken_at_timestamp;
  const postedAt =
    typeof ts === "number" && ts > 0 ? new Date(ts * 1000).toISOString() : null;

  const coauthors = (node.coauthor_producers ?? [])
    .map((c) => str(c?.username))
    .filter((u): u is string => Boolean(u));

  return {
    mediaId,
    shortcode,
    permalink: `https://www.instagram.com/${path}/${shortcode}/`,
    caption,
    thumbnailUrl: str(node.display_url),
    viewCount: num(node.video_view_count),
    // edge_media_preview_like is the public like count; edge_liked_by is the
    // fallback name Instagram has used on the same field.
    likeCount: num(node.edge_media_preview_like?.count ?? node.edge_liked_by?.count),
    commentCount: num(node.edge_media_to_comment?.count),
    postedAt,
    coauthors,
  };
}

// Reads the most recent grid posts for a public account and returns the reels
// among them (collabs included). Single page (~12 most recent posts): enough to
// catch recent collabs while keeping the request count — and thus the risk to
// the cookie account — minimal. Never throws; every failure becomes a status.
export async function fetchGridReels(
  username: string,
  maxReels = 12
): Promise<GridScrapeResult> {
  if (!gridScrapeEnabled()) {
    return { status: process.env.YTDLP_COOKIES_B64 ? "disabled" : "no_cookies", reels: [] };
  }

  const uname = username.trim().replace(/^@+/, "").toLowerCase();
  if (!isValidIgUsername(uname)) {
    return { status: "error", reels: [], error: "invalid username" };
  }

  const cookies = buildCookieHeader();
  if (!cookies) {
    return { status: "no_cookies", reels: [] };
  }

  const url = `${WEB_PROFILE_INFO}?username=${encodeURIComponent(uname)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": process.env.GRID_SCRAPE_UA || DEFAULT_UA,
        "x-ig-app-id": IG_APP_ID,
        "x-requested-with": "XMLHttpRequest",
        Accept: "application/json",
        Referer: `https://www.instagram.com/${uname}/`,
        Cookie: cookies.cookie,
        ...(cookies.csrftoken ? { "x-csrftoken": cookies.csrftoken } : {}),
      },
    });

    if (res.status === 404) {
      return { status: "not_found", reels: [] };
    }
    if (!res.ok) {
      // 401/403/302 → login wall (stale cookies); anything else → transient.
      return { status: "error", reels: [], error: `http ${res.status}` };
    }

    const json = (await res.json()) as {
      data?: { user?: { edge_owner_to_timeline_media?: { edges?: Array<{ node?: TimelineNode }> } } };
    };

    const user = json?.data?.user;
    if (!user) {
      return { status: "not_found", reels: [] };
    }

    const edges = user.edge_owner_to_timeline_media?.edges ?? [];
    const reels: GridReel[] = [];
    for (const edge of edges) {
      const node = edge?.node;
      if (!node || !isReelNode(node)) continue;
      const mapped = mapNode(node);
      if (mapped) reels.push(mapped);
      if (reels.length >= maxReels) break;
    }

    return { status: "ok", reels };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", reels: [], error: msg.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}
