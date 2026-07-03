import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { generateGrowthNotes, type BrandVoice } from "@/lib/ai/claude";
import { resolveUserTier } from "@/lib/ai/tier";
import { getMyInsights, getMyRecentMedia } from "@/lib/instagram/graph-api";
import { consumeUserAction, rateLimitMessage } from "@/lib/utils/user-rate-limit";

// Give the AI retry loop (see lib/ai/provider.ts, ~55s budget) headroom above
// the platform's default function timeout so a legitimate retry isn't killed.
export const maxDuration = 60;

// How many of the most recent posts to feed the model. Whitelisted so a caller
// can't ask us to analyze (and pay tokens for) an unbounded number of posts.
const ALLOWED_LIMITS = [10, 20, 50] as const;
const bodySchema = z
  .object({
    limit: z
      .number()
      .refine((n) => (ALLOWED_LIMITS as readonly number[]).includes(n), "Unsupported limit")
      .optional(),
  })
  .optional();

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await consumeUserAction(supabase, user.id, "growth_notes");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: rateLimitMessage("growth_notes", limit.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const postLimit = parsed.data?.limit ?? 20;

  const credentials = await getIgCredentials(createAdminClient(), user.id).catch(() => null);

  if (!credentials) {
    return NextResponse.json(
      { error: "Connect Instagram first to generate AI growth notes." },
      { status: 400 }
    );
  }

  try {
    const [insightsResult, mediaResult] = await Promise.allSettled([
      getMyInsights(credentials.igUserId, credentials.token),
      getMyRecentMedia(credentials.igUserId, credentials.token),
    ]);

    const insights = insightsResult.status === "fulfilled" ? insightsResult.value : null;
    const recentMedia =
      mediaResult.status === "fulfilled" ? mediaResult.value.media.slice(0, postLimit) : [];

    const metricsPayload = {
      account: insights
        ? {
            followers: insights.followers_count,
            total_posts: insights.media_count,
          }
        : null,
      recent_posts: recentMedia.map((m) => ({
        id: m.id,
        type: m.media_type,
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        timestamp: m.timestamp,
      })),
    };

    // Per-user brand voice tailors the advice to their niche/audience (B2).
    const { data: profile } = await supabase
      .from("profiles")
      .select("brand_voice")
      .eq("id", user.id)
      .maybeSingle();

    const tier = await resolveUserTier(supabase, user.id);
    const { notes, degraded } = await generateGrowthNotes(
      JSON.stringify(metricsPayload),
      (profile?.brand_voice as BrandVoice | null) ?? null,
      tier
    );

    return NextResponse.json({ notes, degraded, analyzed: recentMedia.length });
  } catch (err) {
    console.error("Growth notes failed", err);
    return NextResponse.json({ error: "Could not generate growth notes." }, { status: 500 });
  }
}
