import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateScript } from "@/lib/ai/claude";
import { consumeUserAction, rateLimitMessage } from "@/lib/utils/user-rate-limit";

// Give the AI retry loop (see lib/ai/provider.ts, ~55s budget) headroom above
// the platform's default function timeout so a legitimate retry isn't killed.
export const maxDuration = 60;

// Length caps bound what flows into the model prompt and the database — an
// unbounded caption/context would let a single request burn arbitrary tokens.
const bodySchema = z.object({
  reel_id: z.uuid().optional(),
  caption: z.string().max(5_000).optional(),
  platform: z.string().max(60).default("Instagram Reels"),
  tone: z.string().max(60).default("Direct"),
  custom_context: z.string().max(2_000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Throttle per user so a loop can't burn Anthropic quota.
  const limit = await consumeUserAction(supabase, user.id, "generate_script");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: rateLimitMessage("generate_script", limit.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { reel_id, caption, platform, tone, custom_context } = parsed.data;

  let sourceCaption = caption?.trim() ?? "";
  let reelId: string | null = null;

  if (reel_id) {
    const { data: reel, error: reelError } = await supabase
      .from("tracked_reels")
      .select("id, caption")
      .eq("id", reel_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (reelError) {
      return NextResponse.json({ error: reelError.message }, { status: 500 });
    }
    if (!reel) {
      return NextResponse.json({ error: "Reel not found." }, { status: 404 });
    }

    reelId = reel.id;
    sourceCaption = reel.caption ?? sourceCaption;
  }

  if (!sourceCaption) {
    return NextResponse.json({ error: "caption or reel_id is required." }, { status: 400 });
  }

  const generated = await generateScript({
    caption: sourceCaption,
    platform,
    tone,
    customContext: custom_context,
  });

  const { data: inserted, error: insertError } = await supabase
    .from("generated_scripts")
    .insert({
      user_id: user.id,
      reel_id: reelId,
      hook: generated.hook,
      body: generated.body,
      cta: generated.cta,
      platform,
      status: "draft",
    })
    .select("id, hook, body, cta, status, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Keep counters and lists in step everywhere a script shows up — otherwise
  // the dashboard's "Scripts Generated" stat can lag behind reality.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/scripts");

  return NextResponse.json({ script: inserted });
}
