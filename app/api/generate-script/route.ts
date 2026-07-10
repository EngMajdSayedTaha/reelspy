import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateScript, type BrandVoice } from "@/lib/ai/claude";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { consumeMonthlyQuota, monthlyLimitMessage } from "@/lib/billing/quota";
import { track, trackAiUsage } from "@/lib/analytics/track";
import { consumeUserAction, rateLimitMessage } from "@/lib/utils/user-rate-limit";

// Give the AI retry loop (see lib/ai/provider.ts, ~55s budget) headroom above
// the platform's default function timeout so a legitimate retry isn't killed.
export const maxDuration = 60;

// Length caps bound what flows into the model prompt and the database — an
// unbounded caption/context would let a single request burn arbitrary tokens.
const bodySchema = z.object({
  reel_id: z.uuid().optional(),
  caption: z.string().max(5_000).optional(),
  // A transcript fetched client-side via the "paste a reel link" shortcut,
  // when there's no tracked reel_id to load one from the DB (W1).
  transcript: z.string().max(20_000).optional(),
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

  const { reel_id, caption, transcript: rawTranscript, platform, tone, custom_context } = parsed.data;

  let sourceCaption = caption?.trim() ?? "";
  let reelId: string | null = null;
  // Grounding context (W1) — populated only when generating from a tracked reel.
  let transcript: string | null = null;
  let viralScore: number | null = null;
  let viewCount: number | null = null;
  let postedDaysAgo: number | null = null;

  if (reel_id) {
    const { data: reel, error: reelError } = await supabase
      .from("tracked_reels")
      .select("id, caption, transcript, transcript_status, viral_score, view_count, posted_at")
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

    // Only feed a genuinely-ready transcript into the prompt.
    if (reel.transcript_status === "ready" && reel.transcript) {
      transcript = reel.transcript;
    }
    viralScore = typeof reel.viral_score === "number" ? reel.viral_score : Number(reel.viral_score) || null;
    viewCount = typeof reel.view_count === "number" ? reel.view_count : Number(reel.view_count) || null;
    if (reel.posted_at) {
      const days = Math.floor((Date.now() - new Date(reel.posted_at).getTime()) / 86_400_000);
      postedDaysAgo = Number.isFinite(days) && days >= 0 ? days : null;
    }
  }

  // Fall back to a client-fetched transcript (the "paste a reel link"
  // shortcut) when no tracked reel already supplied one — this is what lets
  // that flow ground the script on real reel audio instead of only a caption.
  if (!transcript && rawTranscript?.trim()) {
    transcript = rawTranscript.trim();
  }

  if (!sourceCaption && !transcript) {
    return NextResponse.json({ error: "caption, transcript, or reel_id is required." }, { status: 400 });
  }

  // Monthly plan quota (L6): checked only once the request is valid, so a
  // malformed call never burns a slot. The hourly throttle above already guards
  // against loops; this enforces the tier's scripts/month cap (unlimited on
  // Studio). Consumed before the AI call — the rare degraded/failed path is
  // bounded by the same hourly limiter.
  const { tier, entitlements } = await resolveUserEntitlements(supabase, user.id);
  const quota = await consumeMonthlyQuota(supabase, user.id, entitlements, "scripts_mo");
  if (!quota.allowed) {
    return NextResponse.json(
      { error: monthlyLimitMessage("scripts_mo", quota.limit, quota.resetAt), upgrade: true },
      { status: 402 }
    );
  }

  // Per-user brand voice drives the AI persona (B2). Best-effort: a missing row
  // or unset value just falls back to the neutral persona in the prompt builder.
  const { data: profile } = await supabase
    .from("profiles")
    .select("brand_voice")
    .eq("id", user.id)
    .maybeSingle();

  const grounded = Boolean(transcript);

  const { script: generated, degraded, provider, usage } = await generateScript({
    caption: sourceCaption,
    platform,
    tone,
    customContext: custom_context,
    brandVoice: (profile?.brand_voice as BrandVoice | null) ?? null,
    transcript,
    viralScore,
    viewCount,
    postedDaysAgo,
    tier,
    aiModel: entitlements.model,
  });

  // Don't persist the placeholder when the AI failed — saving a fake script
  // pollutes the user's Scripts list and their "Scripts Generated" stat with
  // content they never actually got. Hand it back flagged so the UI can warn
  // and let them retry.
  if (degraded) {
    return NextResponse.json({ script: generated, degraded: true, grounded });
  }

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

  // Instrumentation (L5): the output half of the research→script loop (WLC),
  // plus per-call AI cost. Fire-and-forget; never blocks the response on error.
  await track(user.id, "script_generated", {
    grounded_on: grounded ? "transcript" : "caption",
    provider: provider ?? null,
    reel_id: reelId,
  });
  if (usage) {
    await trackAiUsage(user.id, {
      action: "script",
      provider: provider ?? "unknown",
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
  }

  // Keep counters and lists in step everywhere a script shows up — otherwise
  // the dashboard's "Scripts Generated" stat can lag behind reality.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/scripts");

  return NextResponse.json({ script: inserted, degraded: false, grounded });
}
