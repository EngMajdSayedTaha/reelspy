import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { generateGrowthNotes } from "@/lib/ai/claude";
import { getMyInsights, getMyRecentMedia } from "@/lib/instagram/graph-api";
import { consumeUserAction, rateLimitMessage } from "@/lib/utils/user-rate-limit";

export async function POST() {
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
    const recentMedia = mediaResult.status === "fulfilled" ? mediaResult.value.media.slice(0, 20) : [];

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

    const notes = await generateGrowthNotes(JSON.stringify(metricsPayload));

    return NextResponse.json({ notes });
  } catch (err) {
    console.error("Growth notes failed", err);
    return NextResponse.json({ error: "Could not generate growth notes." }, { status: 500 });
  }
}
