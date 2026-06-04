import { ReelCard } from "@/components/reels/ReelCard";

type Reel = {
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

type ReelFeedProps = {
  reels: Reel[];
  markWorkedAction: (formData: FormData) => Promise<void>;
};

export function ReelFeed({ reels, markWorkedAction }: ReelFeedProps) {
  if (reels.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
        No tracked reels yet. Connect Instagram and run sync to populate this feed.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {reels.map((reel) => (
        <ReelCard key={reel.id} reel={reel} markWorkedAction={markWorkedAction} />
      ))}
    </div>
  );
}
