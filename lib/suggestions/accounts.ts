// Niche-based viral account suggestions (onboarding quiz follow-up). Entirely
// data-driven off the existing Niche Radar aggregates (lib/trends/niche.ts) —
// real accounts, real viral scores, never a hallucinated handle. The only AI
// involvement is mapping the user's free-text niche onto the Radar taxonomy
// (`resolveNicheSlug`); ranking itself is plain math over cached snapshots.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat, aiConfigured, type JsonTool } from "@/lib/ai/provider";
import {
  ALL_NICHES,
  slugifyNiche,
  nicheTrending,
  type NicheSummary,
  type TrendReel,
} from "@/lib/trends/niche";

const NICHE_TOOL: JsonTool = {
  name: "pick_niche",
  description:
    "Pick the single closest matching niche from the provided list, or an empty string if none are a reasonable match.",
  inputSchema: {
    type: "object",
    properties: {
      niche: {
        type: "string",
        description: 'One of the exact niche strings from the list, or "" if none fit.',
      },
    },
    required: ["niche"],
    additionalProperties: false,
  },
};

// Extract a JSON object from model output that may be wrapped in code fences
// or preceded/followed by stray text (the NVIDIA/Llama path isn't always clean).
function extractJsonObject(text: string): Record<string, unknown> | null {
  const clean = text.replace(/```(?:json)?/gi, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/\s+/).filter(Boolean));
}

// Best fuzzy match by shared-word ratio (Jaccard-ish) — catches cases like
// "real estate agent" -> "real estate" that a plain substring check would miss.
function bestWordOverlapMatch(slug: string, available: NicheSummary[]): string | null {
  const tokens = tokenize(slug);
  if (tokens.size === 0) return null;

  let best: { niche: string; score: number } | null = null;
  for (const n of available) {
    const nTokens = tokenize(n.niche);
    const shared = [...tokens].filter((t) => nTokens.has(t)).length;
    if (shared === 0) continue;
    const union = new Set([...tokens, ...nTokens]).size;
    const score = shared / union;
    if (!best || score > best.score) best = { niche: n.niche, score };
  }
  return best && best.score >= 0.2 ? best.niche : null;
}

// Map a creator's free-text niche onto the Niche Radar taxonomy. Pure string
// matching first (exact, substring, word-overlap) — cheap and deterministic.
// Only falls through to a single AI call when those all miss, and only when an
// AI provider is configured. Any AI failure resolves to null, never throws —
// callers fall back to global trending.
export async function resolveNicheSlug(
  nicheText: string,
  available: NicheSummary[]
): Promise<string | null> {
  const slug = slugifyNiche(nicheText);
  if (!slug || available.length === 0) return null;

  const exact = available.find((n) => n.niche === slug);
  if (exact) return exact.niche;

  const substring = available.find((n) => n.niche.includes(slug) || slug.includes(n.niche));
  if (substring) return substring.niche;

  const overlap = bestWordOverlapMatch(slug, available);
  if (overlap) return overlap;

  if (!aiConfigured()) return null;

  try {
    const list = available
      .map((n) => n.niche)
      .slice(0, 40)
      .join(", ");
    const result = await chat({
      system:
        "You map a creator's free-text niche description onto a fixed taxonomy of niches. Respond only by calling the pick_niche tool.",
      user: `Creator's niche: "${nicheText}"\n\nAvailable niches: ${list}\n\nPick the single closest match from the list, or return an empty string if none are reasonably close. Never invent a niche not in the list.`,
      maxTokens: 200,
      jsonObject: true,
      jsonTool: NICHE_TOOL,
    });
    if (!result) return null;

    const parsed = extractJsonObject(result.text);
    const picked = typeof parsed?.niche === "string" ? parsed.niche.trim() : "";
    if (!picked) return null;
    return available.find((n) => n.niche === picked)?.niche ?? null;
  } catch (err) {
    console.warn("[suggestions] resolveNicheSlug AI fallback failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export type SuggestedAccount = {
  igUsername: string;
  displayName: string | null;
  avatarUrl: string | null;
  followers: number | null;
  topReel: {
    permalink: string | null;
    thumbnailUrl: string | null;
    viewCount: number;
    outperformRatio: number;
  } | null;
};

type SnapshotRow = {
  ig_username: string;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
};

// Rank real cross-user accounts for a niche (or global, as a fallback), one row
// per account (its best-performing reel), excluding accounts the user already
// tracks. Never touches an AI provider — pure aggregation over cached snapshots.
export async function suggestedAccounts(
  admin: SupabaseClient,
  opts: { nicheSlug: string | null; excludeUsernames: string[]; limit?: number }
): Promise<{ accounts: SuggestedAccount[]; fallback: boolean }> {
  const limit = opts.limit ?? 6;
  const exclude = new Set(opts.excludeUsernames.map((u) => u.toLowerCase()));

  const rank = (niche: string): Promise<TrendReel[]> => nicheTrending(admin, { niche, limit: 60 });

  let fallback = false;
  let reels = opts.nicheSlug ? await rank(opts.nicheSlug) : [];
  if (reels.length === 0) {
    fallback = true;
    reels = await rank(ALL_NICHES);
  }

  const byAccount = new Map<string, TrendReel>();
  for (const r of reels) {
    const key = r.igUsername.toLowerCase();
    if (exclude.has(key)) continue;
    const existing = byAccount.get(key);
    if (!existing || r.outperformRatio > existing.outperformRatio) {
      byAccount.set(key, r);
    }
  }

  const top = [...byAccount.values()]
    .sort((a, b) => b.outperformRatio - a.outperformRatio || b.relativeScore - a.relativeScore)
    .slice(0, limit);

  if (top.length === 0) return { accounts: [], fallback };

  const { data: snaps } = await admin
    .from("ig_account_snapshots")
    .select("ig_username, display_name, avatar_url, followers_count")
    .in(
      "ig_username",
      top.map((r) => r.igUsername)
    )
    .returns<SnapshotRow[]>();
  const snapByUsername = new Map((snaps ?? []).map((s) => [s.ig_username.toLowerCase(), s]));

  const accounts: SuggestedAccount[] = top.map((r) => {
    const snap = snapByUsername.get(r.igUsername.toLowerCase());
    return {
      igUsername: r.igUsername,
      displayName: snap?.display_name ?? null,
      avatarUrl: snap?.avatar_url ?? null,
      followers: r.followers,
      topReel: {
        permalink: r.permalink,
        thumbnailUrl: r.thumbnailUrl,
        viewCount: r.viewCount,
        outperformRatio: r.outperformRatio,
      },
    };
  });

  return { accounts, fallback };
}

export type UserSuggestions = { accounts: SuggestedAccount[]; niche: string | null; fallback: boolean };

const EMPTY_SUGGESTIONS: UserSuggestions = { accounts: [], niche: null, fallback: false };

// Suggestions for the signed-in user's own niche, excluding what they already
// track. Never throws — any failure (missing tables on a fresh deploy, a
// transient DB error) degrades to an empty result so the section just doesn't
// render rather than breaking the page.
export async function getSuggestionsForUser(userId: string): Promise<UserSuggestions> {
  try {
    const supabase = await createClient();
    const [{ data: profile }, { data: tracked }] = await Promise.all([
      supabase.from("profiles").select("niche_slug").eq("id", userId).maybeSingle(),
      supabase.from("inspiration_accounts").select("ig_username").eq("user_id", userId),
    ]);

    const nicheSlug = (profile?.niche_slug as string | null) ?? null;
    const excludeUsernames = (tracked ?? []).map((r) => r.ig_username as string);

    const admin = createAdminClient();
    const { accounts, fallback } = await suggestedAccounts(admin, {
      nicheSlug,
      excludeUsernames,
      limit: 6,
    });

    return { accounts, niche: nicheSlug, fallback };
  } catch (err) {
    console.warn("[suggestions] getSuggestionsForUser failed:", err instanceof Error ? err.message : err);
    return EMPTY_SUGGESTIONS;
  }
}
