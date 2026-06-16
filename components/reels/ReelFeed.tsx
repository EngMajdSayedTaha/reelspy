"use client";

import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { ReelCard } from "@/components/reels/ReelCard";
import { ReelRow } from "@/components/reels/ReelRow";
import { FeedViewToggle, type FeedView } from "@/components/reels/FeedViewToggle";

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
  is_discarded: boolean | null;
  is_favorite: boolean | null;
  inspiration_accounts:
    | { ig_username: string; display_name: string | null; avatar_url: string | null }
    | { ig_username: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

type ReelFeedProps = {
  reels: Reel[];
  markWorkedAction: (formData: FormData) => Promise<void>;
  discardAction: (formData: FormData) => Promise<void>;
  favoriteAction: (formData: FormData) => Promise<void>;
  hasFilters?: boolean;
};

const STORAGE_KEY = "reelspy:feedView";

function isFeedView(v: string | null): v is FeedView {
  return v === "grid" || v === "list" || v === "reels";
}

export function ReelFeed({
  reels,
  markWorkedAction,
  discardAction,
  favoriteAction,
  hasFilters,
}: ReelFeedProps) {
  // Default to grid for a deterministic first paint, then hydrate the saved
  // preference after mount (localStorage isn't available during SSR).
  const [view, setView] = useState<FeedView>("grid");

  useEffect(() => {
    const restore = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isFeedView(saved)) setView(saved);
    };
    restore();
  }, []);

  function changeView(next: FeedView) {
    setView(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-background px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Inbox className="h-6 w-6 text-subtle" />
        </span>
        <p className="text-sm font-medium text-muted-foreground">
          {hasFilters ? "No reels match these filters" : "No tracked reels yet"}
        </p>
        <p className="max-w-sm text-sm text-subtle">
          {hasFilters
            ? "Try clearing filters or syncing more accounts."
            : "Connect Instagram and run a sync to populate your feed."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-subtle">
          {reels.length} {reels.length === 1 ? "reel" : "reels"} shown
        </span>
        <FeedViewToggle value={view} onChange={changeView} />
      </div>

      {view === "grid" ? (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reels.map((reel) => (
            <ReelCard
              key={reel.id}
              reel={reel}
              markWorkedAction={markWorkedAction}
              discardAction={discardAction}
              favoriteAction={favoriteAction}
            />
          ))}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="stagger flex flex-col gap-3">
          {reels.map((reel) => (
            <ReelRow
              key={reel.id}
              reel={reel}
              markWorkedAction={markWorkedAction}
              discardAction={discardAction}
              favoriteAction={favoriteAction}
            />
          ))}
        </div>
      ) : null}

      {view === "reels" ? (
        <div className="stagger mx-auto flex max-w-md flex-col gap-6">
          {reels.map((reel) => (
            <ReelCard
              key={reel.id}
              reel={reel}
              markWorkedAction={markWorkedAction}
              discardAction={discardAction}
              favoriteAction={favoriteAction}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
