import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";

// Matches /reel/, /reels/, or /p/ segments — optionally preceded by a username.
const IG_URL_RE = /instagram\.com\/(?:[a-z0-9._]{1,30}\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i;
// Extracts the username when the URL contains /username/reel/SHORTCODE.
const IG_USERNAME_FROM_URL_RE =
  /instagram\.com\/([a-z0-9._]{1,30})\/(?:reel|reels|p)\//i;

const bodySchema = z.object({
  url: z.string().url().max(500),
});

// Drop tracking query params (igsh, etc.) — oEmbed only needs the canonical path.
function cleanIgUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw;
  }
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

  const cleanUrl = cleanIgUrl(parsed.data.url);

  if (!IG_URL_RE.test(cleanUrl)) {
    return NextResponse.json(
      { error: "That doesn't look like an Instagram reel link." },
      { status: 400 }
    );
  }

  const usernameMatch = IG_USERNAME_FROM_URL_RE.exec(cleanUrl);
  const urlUsername = usernameMatch?.[1]?.toLowerCase() ?? "";

  // Prefer the user's connected token — it's a proven live user access token.
  // Fall back to the app token (APP_ID|APP_SECRET) if they haven't connected yet.
  let accessToken: string | null = null;
  try {
    const admin = createAdminClient();
    const credentials = await getIgCredentials(admin, user.id);
    if (credentials?.token) {
      accessToken = credentials.token;
    }
  } catch {
    // Non-fatal — fall through to app token
  }

  if (!accessToken) {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (appId && appSecret) {
      accessToken = `${appId}|${appSecret}`;
    }
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: "Instagram integration is not configured." },
      { status: 503 }
    );
  }

  const oembedUrl = new URL("https://graph.facebook.com/v23.0/instagram_oembed");
  oembedUrl.searchParams.set("url", cleanUrl);
  oembedUrl.searchParams.set("access_token", accessToken);

  type OembedData = { author_name?: string; title?: string; thumbnail_url?: string };
  let oembed: OembedData | null = null;

  try {
    const res = await fetch(oembedUrl.toString(), { cache: "no-store" });
    if (res.ok) {
      oembed = (await res.json()) as OembedData;
    } else {
      const body = await res.text();
      console.error("[reel-from-link] oEmbed error", res.status, body);
      const isPrivate = /code[":\\s]*100|private|media not found/i.test(body);
      const isTokenErr = /190|invalid.*token|oauth.*exception/i.test(body);

      if (isTokenErr) {
        return NextResponse.json(
          {
            error:
              "Instagram token error. Please reconnect your Instagram account in Settings → Instagram.",
          },
          { status: 422 }
        );
      }

      return NextResponse.json(
        {
          error: isPrivate
            ? "This reel is private or not publicly accessible."
            : "Could not fetch reel data. Make sure the link is public and try again.",
        },
        { status: 422 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not reach Instagram. Check the link and try again." },
      { status: 502 }
    );
  }

  const username = (oembed?.author_name ?? urlUsername).toLowerCase().replace(/^@/, "");
  const caption = oembed?.title ?? "";

  return NextResponse.json({
    username,
    caption,
    thumbnail_url: oembed?.thumbnail_url ?? null,
    permalink: cleanUrl,
  });
}
