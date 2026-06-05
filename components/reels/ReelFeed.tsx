import { Inbox } from "lucide-react";
import { ReelCard } from "@/components/reels/ReelCard";

type Reel = {
  id: string;
  caption: string | null;
  ig_permalink: string;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  viral_score: number | null;
  is_worked_on: boolean | null;
  posted_at: string | null;
  transcript_status: string | null;
  inspiration_accounts:
    | { ig_username: string; display_name: string | null; avatar_url: string | null }
    | { ig_username: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

type ReelFeedProps = {
  reels: Reel[];
  markWorkedAction: (formData: FormData) => Promise<void>;
  hasFilters?: boolean;
};

export function ReelFeed({ reels, markWorkedAction, hasFilters }: ReelFeedProps) {
  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#262626] bg-[#0f0f0f] px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a1a]">
          <Inbox className="h-6 w-6 text-zinc-500" />
        </span>
        <p className="text-sm font-medium text-zinc-300">
          {hasFilters ? "No reels match these filters" : "No tracked reels yet"}
        </p>
        <p className="max-w-sm text-sm text-zinc-500">
          {hasFilters
            ? "Try clearing filters or syncing more accounts."
            : "Connect Instagram and run a sync to populate your feed."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {reels.map((reel) => (
        <ReelCard key={reel.id} reel={reel} markWorkedAction={markWorkedAction} />
      ))}
    </div>
  );
}
