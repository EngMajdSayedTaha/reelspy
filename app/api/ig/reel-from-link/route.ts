import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Matches /reel/, /reels/, or /p/ segments — optionally preceded by a username.
const IG_URL_RE = /instagram\.com\/(?:[a-z0-9._]{1,30}\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i;
// Extracts the username when the URL contains /username/reel/SHORTCODE.
const IG_USERNAME_FROM_URL_RE =
  /instagram\.com\/([a-z0-9._]{1,30})\/(?:reel|reels|p)\//i;

const bodySchema = z.object({
  url: z.string().url().max(500),
});

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

  const { url } = parsed.data;

  if (!IG_URL_RE.test(url)) {
    return NextResponse.json(
      { error: "That doesn't look like an Instagram reel link." },
      { status: 400 }
    );
  }

  const usernameMatch = IG_USERNAME_FROM_URL_RE.exec(url);
  const urlUsername = usernameMatch?.[1]?.toLowerCase() ?? "";

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "Instagram integration is not configured." },
      { status: 503 }
    );
  }

  const oembedUrl = new URL("https://graph.facebook.com/v23.0/instagram_oembed");
  oembedUrl.searchParams.set("url", url);
  oembedUrl.searchParams.set("access_token", `${appId}|${appSecret}`);

  type OembedData = { author_name?: string; title?: string; thumbnail_url?: string };
  let oembed: OembedData | null = null;

  try {
    const res = await fetch(oembedUrl.toString(), { cache: "no-store" });
    if (res.ok) {
      oembed = (await res.json()) as OembedData;
    } else {
      const body = await res.text();
      const isPrivate = /code[":\\s]*100|private|media not found/i.test(body);
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
    permalink: url,
  });
}
