import { type NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { isMetaRateLimitMessage } from "@/lib/instagram/graph-api";
import {
  readMyInsightsCache,
  revalidateMyInsights,
  syncMyInsights,
  type MyInsightsPayload,
} from "@/lib/instagram/my-insights";

// The user's OWN reels + insights, served cache-first:
//   - fresh cache  → instant Postgres read, zero Graph calls
//   - stale cache  → served instantly, revalidated in the background (after())
//   - no cache, or ?refresh=1 ("Sync my reels") → live batched sync
// The live sync reads the connected account directly — it does not touch the
// shared Business Discovery budget — but Meta throttling is app-wide, so when
// it happens here we open the shared circuit breaker too.
export const runtime = "nodejs";
export const maxDuration = 60;

function respond(payload: MyInsightsPayload, syncedAt: string) {
  return NextResponse.json({ connected: true, synced_at: syncedAt, ...payload });
}

export async function GET(request: NextRequest) {
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

  const force = request.nextUrl.searchParams.get("refresh") === "1";
  const cached = await readMyInsightsCache(admin, user.id);

  if (cached && !force) {
    if (!cached.fresh) {
      // Stale-while-revalidate: the response goes out now; the refresh runs
      // after it, so the next visit picks up the new data.
      after(async () => {
        try {
          await revalidateMyInsights(admin, user.id, credentials);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (isMetaRateLimitMessage(message)) {
            await createMetaRateLimiter(admin, user.id).recordThrottle();
          }
          console.error("My IG background revalidation failed", error);
        }
      });
    }
    return respond(cached.payload, cached.fetchedAt);
  }

  const limiter = createMetaRateLimiter(admin, user.id);

  try {
    const payload = await syncMyInsights(admin, user.id, credentials);
    return respond(payload, new Date().toISOString());
  } catch (error) {
    console.error("My IG sync failed", error);
    const message = error instanceof Error ? error.message : String(error);
    if (isMetaRateLimitMessage(message)) {
      await limiter.recordThrottle();
      // A forced sync that hit the wall still has yesterday's numbers to show;
      // the partial flag tells the UI this isn't a fresh sync.
      if (cached) {
        return respond({ ...cached.payload, partial: true }, cached.fetchedAt);
      }
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
