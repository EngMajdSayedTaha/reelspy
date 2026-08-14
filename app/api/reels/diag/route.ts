import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIgCookieStatus } from "@/lib/media/ig-cookies";
import { processReel } from "@/lib/media/pipeline";
import { getReelMetadata, probeYtDlp } from "@/lib/media/ytdlp";
import { classifyYtDlpError } from "@/lib/media/ytdlp-errors";
import { consumeUserAction, rateLimitMessage } from "@/lib/utils/user-rate-limit";

// Post-deploy diagnostics for the transcript pipeline. Auth-gated.
//   GET /api/reels/diag                     -> env + yt-dlp binary health
//   GET /api/reels/diag?url=<reel>          -> also resolve metadata/media URL
//   GET /api/reels/diag?url=<reel>&transcribe=1 -> also run the full pipeline
export const runtime = "nodejs";
export const maxDuration = 300;

// The ?transcribe=1 path runs the full yt-dlp + Whisper pipeline (minutes of
// compute per call), so it's restricted to an explicit allowlist of user IDs
// via DIAG_ALLOWED_USER_IDS (comma-separated). Fails CLOSED: if the env var is
// unset, no one can trigger the heavy pipeline through this diagnostic route.
// The cheap metadata-only path stays open to any authenticated user.
function diagTranscribeAllowed(userId: string): boolean {
  const raw = process.env.DIAG_ALLOWED_USER_IDS?.trim();
  if (!raw) return false;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}

// Only the reel/post path shapes we hand to yt-dlp — kept in step with
// app/api/ig/reel-from-link/route.ts, which validates the same way.
const IG_PATH_RE = /^\/(?:[a-z0-9._]{1,30}\/)?(?:reel|reels|p)\/[A-Za-z0-9_-]+\/?$/i;

// yt-dlp will happily fetch ANY url it's given (including internal/metadata
// endpoints), so only Instagram reel URLs are accepted here.
//
// The host check alone is not enough: it let any authenticated user aim yt-dlp
// at an arbitrary instagram.com path (login/checkpoint/profile endpoints), each
// hit riding the shared cookie session. Validate the PARSED pathname too, and
// return the bare origin+path so query/fragment can't smuggle anything through.
function safeIgUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const isInstagramHost =
    host === "instagram.com" || host === "instagr.am" || host.endsWith(".instagram.com");
  if (!isInstagramHost) return null;
  if (!IG_PATH_RE.test(parsed.pathname)) return null;
  return `${parsed.origin}${parsed.pathname}`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every path below spawns at least one yt-dlp process (probeYtDlp), and the
  // ?url= paths spawn a second one that reaches Instagram over the shared cookie
  // session. Throttle before doing any of that — this route previously had no
  // limit at all, so any signed-in free-tier account could loop it.
  const limit = await consumeUserAction(supabase, user.id, "reel_diag");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: rateLimitMessage("reel_diag", limit.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const transcribe = searchParams.get("transcribe") === "1";

  const url = rawUrl ? safeIgUrl(rawUrl) : null;
  if (rawUrl && !url) {
    return NextResponse.json(
      { error: "Only Instagram reel/post URLs are supported." },
      { status: 400 }
    );
  }

  if (transcribe && !diagTranscribeAllowed(user.id)) {
    return NextResponse.json(
      { error: "Running the transcription pipeline via diagnostics is restricted." },
      { status: 403 }
    );
  }

  // Drop the server-side filesystem detail before this crosses the wire — every
  // signed-in user can reach this route, and the binary path plus a raw probe
  // error map out the deployment for anyone probing it. `available` + `version`
  // are what the smoke test actually needs.
  const { binaryPath: _binaryPath, error: probeError, ...probe } = await probeYtDlp();
  if (probeError) console.error("[reels/diag] yt-dlp probe failed:", probeError);
  const ytdlp = { ...probe, healthy: !probeError };

  const whisper = {
    groq: Boolean(process.env.GROQ_API_KEY),
    huggingface: Boolean(process.env.HF_API_TOKEN),
  };

  // Cookie session health (status only — never the cookie material itself).
  const cookieStatus = await getIgCookieStatus();
  const cookies = {
    ...cookieStatus,
    ageDays: cookieStatus.updatedAt
      ? Math.floor((Date.now() - Date.parse(cookieStatus.updatedAt)) / 86_400_000)
      : null,
  };

  const response: Record<string, unknown> = { ytdlp, whisper, cookies };

  if (url) {
    if (transcribe) {
      const result = await processReel(url);
      response.reel =
        result.status === "ready"
          ? {
              status: "ready",
              source: result.source,
              language: result.language,
              durationSec: result.metadata.durationSec,
              mediaResolved: Boolean(result.metadata.mediaUrl),
              transcriptPreview: result.text.slice(0, 240),
              transcriptChars: result.text.length,
            }
          : { status: "unavailable", reason: result.reason, durationSec: result.metadata?.durationSec ?? null };
    } else {
      try {
        const metadata = await getReelMetadata(url);
        response.reel = {
          status: "metadata-only",
          mediaResolved: Boolean(metadata.mediaUrl),
          durationSec: metadata.durationSec,
          uploader: metadata.uploader,
          hasThumbnail: Boolean(metadata.thumbnail),
        };
      } catch (error) {
        // Never hand yt-dlp's raw stderr back over the wire: it carries the
        // binary path, the cookie-jar path and other server-side detail. Log it
        // in full, return only the classification — same posture as
        // app/api/ig/reel-from-link/route.ts.
        const detail = error instanceof Error ? error.message : "metadata extraction failed";
        console.error("[reels/diag] metadata extraction failed:", detail);
        response.reel = { status: "error", reason: classifyYtDlpError(detail) };
      }
    }
  }

  return NextResponse.json(response);
}
