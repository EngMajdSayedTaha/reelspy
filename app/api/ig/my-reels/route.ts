import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { getIgCredentials } from "@/lib/instagram/token-store";
import {
  getMediaInsights,
  getMyInsights,
  getMyMediaPaged,
  isMetaRateLimitMessage,
  type MediaInsights,
  type MyMediaItem,
} from "@/lib/instagram/graph-api";

// Dedicated sync for the user's OWN reels: profile, full media history, and
// per-reel insights (views, reach, saves, shares, watch time). These calls read
// the connected account directly — they do not touch the shared Business
// Discovery budget — but they're paced anyway to be gentle on Meta's app limit.
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_MEDIA = 60;
const MAX_INSIGHTS = 30;
const PACE_MS = 120;

type EnrichedMedia = MyMediaItem & { insights: MediaInsights | null };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isReelItem(item: MyMediaItem): boolean {
  return (
    String(item.media_product_type ?? "").toUpperCase() === "REELS" ||
    String(item.media_type ?? "").toUpperCase() === "VIDEO"
  );
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const credentials = await getIgCredentials(admin, user.id).catch(() => null);

  if (!credentials) {
    return NextResponse.json({ connected: false });
  }

  // Own-media reads don't consume the shared Business Discovery budget, but
  // Meta throttling is app-wide — so when it happens here, open the shared
  // circuit breaker too instead of letting other syncs keep hammering.
  const limiter = createMetaRateLimiter(admin, user.id);

  try {
    const [profile, media] = await Promise.all([
      getMyInsights(credentials.igUserId, credentials.token),
      getMyMediaPaged(credentials.igUserId, credentials.token, MAX_MEDIA),
    ]);

    // Per-media insights for the most recent items. Sequential + paced; stop
    // immediately if Meta starts throttling and return what we have.
    const enriched: EnrichedMedia[] = [];
    let insightsFetched = 0;
    let partial = false;

    for (const item of media) {
      if (insightsFetched >= MAX_INSIGHTS || partial) {
        enriched.push({ ...item, insights: null });
        continue;
      }
      try {
        const insights = await getMediaInsights(item.id, credentials.token, isReelItem(item));
        enriched.push({ ...item, insights });
        insightsFetched += 1;
        await sleep(PACE_MS);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMetaRateLimitMessage(message)) {
          partial = true;
          await limiter.recordThrottle();
          enriched.push({ ...item, insights: null });
        } else {
          enriched.push({ ...item, insights: null });
          insightsFetched += 1;
        }
      }
    }

    // Aggregate totals across the items that actually returned insights.
    const totals = enriched.reduce(
      (acc, item) => {
        const ins = item.insights;
        if (!ins) return acc;
        acc.analyzed += 1;
        acc.views += ins.views ?? 0;
        acc.reach += ins.reach ?? 0;
        acc.likes += ins.likes ?? item.like_count ?? 0;
        acc.comments += ins.comments ?? item.comments_count ?? 0;
        acc.saved += ins.saved ?? 0;
        acc.shares += ins.shares ?? 0;
        return acc;
      },
      { analyzed: 0, views: 0, reach: 0, likes: 0, comments: 0, saved: 0, shares: 0 }
    );

    return NextResponse.json({
      connected: true,
      profile: {
        username: profile.username,
        followers_count: profile.followers_count,
        media_count: profile.media_count,
        biography: profile.biography,
        profile_picture_url: profile.profile_picture_url,
      },
      media: enriched,
      totals,
      partial: partial || undefined,
    });
  } catch (error) {
    console.error("My IG sync failed", error);
    const message = error instanceof Error ? error.message : String(error);
    if (isMetaRateLimitMessage(message)) {
      await limiter.recordThrottle();
      return NextResponse.json(
        { error: "Instagram is rate-limiting requests right now. Try again in a bit." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Could not load your Instagram data. Your connection may need a refresh — check Settings." },
      { status: 502 }
    );
  }
}
