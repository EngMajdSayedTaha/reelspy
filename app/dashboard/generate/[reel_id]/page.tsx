import { redirect } from "next/navigation";
import { ScriptGenerator } from "@/components/scripts/ScriptGenerator";
import { TranscriptPanel } from "@/components/reels/TranscriptPanel";
import { ReelCard } from "@/components/reels/ReelCard";
import { createClient } from "@/lib/supabase/server";
import {
  markReelAsWorkedOn,
  setReelDiscarded,
  setReelFavorited,
} from "@/app/dashboard/feed/actions";

type TranscriptStatus = "none" | "pending" | "ready" | "failed";

type PageProps = {
  params: Promise<{ reel_id: string }>;
};

export default async function GenerateScriptPage({ params }: PageProps) {
  const { reel_id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reel, error } = await supabase
    .from("tracked_reels")
    .select(
      "id, caption, ig_permalink, thumbnail_url, view_count, like_count, comment_count, viral_score, is_worked_on, posted_at, transcript, transcript_lang, transcript_source, transcript_status, viral_pattern, is_discarded, is_favorite, inspiration_accounts(ig_username, display_name, avatar_url)"
    )
    .eq("id", reel_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!reel) {
    redirect("/dashboard/feed");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white">Generate Script</h1>
        <p className="text-sm text-zinc-400">Create an original script from this reel inspiration.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
        {/* Source reel — same card as the feed, watchable inline. Capped at
            the rail width from `sm` up so it doesn't balloon on tablets. */}
        <div className="space-y-2 sm:max-w-[340px] lg:sticky lg:top-20">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Source reel</p>
          <ReelCard
            reel={reel}
            markWorkedAction={markReelAsWorkedOn}
            discardAction={setReelDiscarded}
            favoriteAction={setReelFavorited}
          />
        </div>

        <div className="space-y-6">
          <TranscriptPanel
            reelId={reel.id}
            initialTranscript={reel.transcript ?? null}
            initialStatus={(reel.transcript_status as TranscriptStatus | null) ?? "none"}
            initialSource={reel.transcript_source ?? null}
            initialLanguage={reel.transcript_lang ?? null}
          />

          <ScriptGenerator reelId={reel.id} initialCaption={reel.caption ?? ""} />
        </div>
      </div>
    </div>
  );
}
