import { redirect } from "next/navigation";
import { ReelFeed } from "@/components/reels/ReelFeed";
import { SyncButton } from "@/components/reels/SyncButton";
import { createClient } from "@/lib/supabase/server";
import { markReelAsWorkedOn } from "./actions";

type FeedReel = {
  id: string;
  caption: string | null;
  ig_permalink: string;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  viral_score: number | null;
  is_worked_on: boolean | null;
  posted_at: string | null;
  inspiration_accounts: { ig_username: string } | { ig_username: string }[] | null;
};

export default async function FeedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("tracked_reels")
    .select(
      "id, caption, ig_permalink, view_count, like_count, comment_count, viral_score, is_worked_on, posted_at, inspiration_accounts(ig_username)"
    )
    .eq("user_id", user.id)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const reels = (data ?? []) as FeedReel[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-white">Feed</h1>
          <p className="text-sm text-zinc-400">
            Review tracked reels, score performance, and mark ideas as worked on.
          </p>
        </div>

        <SyncButton />
      </div>

      <ReelFeed reels={reels} markWorkedAction={markReelAsWorkedOn} />
    </div>
  );
}
