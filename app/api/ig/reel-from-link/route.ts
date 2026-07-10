import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getReelMetadata, YtDlpUnavailableError } from "@/lib/media/ytdlp";
import { classifyYtDlpError, YtDlpExtractionError } from "@/lib/media/ytdlp-errors";
import { transcribeReel } from "@/lib/transcription";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { consumeMonthlyQuota, monthlyLimitMessage } from "@/lib/billing/quota";
import { track } from "@/lib/analytics/track";
import { consumeUserAction, rateLimitMessage } from "@/lib/utils/user-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

// Only the reel/post path shapes we hand to yt-dlp. Tested against the parsed
// pathname (not the raw string), so it can't be fooled by userinfo/host tricks.
const IG_PATH_RE = /^\/(?:[a-z0-9._]{1,30}\/)?(?:reel|reels|p)\/[A-Za-z0-9_-]+\/?$/i;

const bodySchema = z.object({
  url: z.string().url().max(500),
});

// Strictly validate the link before it reaches yt-dlp: parse it, require https,
// require the host to be Instagram itself (blocks SSRF via `//evil.com@instagram.com`
// or `instagram.com.attacker.tld`), then return the bare origin+path with any
// query/fragment stripped. Returns null when the link isn't a real IG reel/post.
function safeIgUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }

  if (u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase();
  const isInstagramHost = host === "instagram.com" || host.endsWith(".instagram.com");
  if (!isInstagramHost) return null;

  if (!IG_PATH_RE.test(u.pathname)) return null;

  return `${u.origin}${u.pathname}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  const cleanUrl = safeIgUrl(parsed.data.url);

  if (!cleanUrl) {
    return NextResponse.json(
      { error: "That doesn't look like an Instagram reel link." },
      { status: 400 }
    );
  }

  // Same yt-dlp + Whisper pipeline as the per-reel transcript route, so it
  // shares the "transcript" bucket — a loop here burns the same compute/quota.
  const limit = await consumeUserAction(supabase, user.id, "transcript");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: rateLimitMessage("transcript", limit.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  // Monthly plan quota (L6): shares the transcripts/month cap with the per-reel
  // route since it runs the same yt-dlp + Whisper pipeline.
  const { entitlements } = await resolveUserEntitlements(supabase, user.id);
  const quota = await consumeMonthlyQuota(supabase, user.id, entitlements, "transcripts_mo");
  if (!quota.allowed) {
    return NextResponse.json(
      { error: monthlyLimitMessage("transcripts_mo", quota.limit, quota.resetAt), upgrade: true },
      { status: 402 }
    );
  }

  let metadata: Awaited<ReturnType<typeof getReelMetadata>>;
  try {
    metadata = await getReelMetadata(cleanUrl);
  } catch (err) {
    if (err instanceof YtDlpUnavailableError) {
      return NextResponse.json(
        { error: "Video processing is temporarily unavailable. Try again shortly." },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to read reel.";
    console.error("[reel-from-link] yt-dlp error:", message);
    const kind = err instanceof YtDlpExtractionError ? err.kind : classifyYtDlpError(message);
    const friendly =
      kind === "authRequired" || kind === "botCheck"
        ? "This reel is private or requires login to access."
        : kind === "rateLimited"
          ? "Instagram is rate-limiting requests right now. Please try again in a few minutes."
          : kind === "unavailable"
            ? "This reel appears to be unavailable or was removed."
            : "Could not fetch reel data. Make sure the link is public and try again.";
    return NextResponse.json({ error: friendly }, { status: 422 });
  }

  if (!metadata.mediaUrl) {
    return NextResponse.json(
      { error: "Could not resolve a media URL for this reel." },
      { status: 422 }
    );
  }

  const result = await transcribeReel({ permalink: cleanUrl, mediaUrl: metadata.mediaUrl });

  if (result.status !== "ready") {
    console.error("[reel-from-link] transcription failed:", result.reason);
    return NextResponse.json(
      { error: "Could not transcribe this reel. Make sure the link is public and try again." },
      { status: 422 }
    );
  }

  // Instrumentation (L5): a research event — the input half of the WLC loop.
  await track(user.id, "transcript_ready", {
    source: result.source,
    lang: result.language,
    via: "link",
  });

  return NextResponse.json({ transcript: result.text });
}
