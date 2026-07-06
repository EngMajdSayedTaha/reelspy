"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, Sparkles } from "lucide-react";
import { ReelCard } from "@/components/reels/ReelCard";
import { ReelRow } from "@/components/reels/ReelRow";
import { FeedViewToggle, type FeedView } from "@/components/reels/FeedViewToggle";
import { useDict } from "@/lib/i18n/I18nProvider";

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
  hasAccounts?: boolean;
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
  hasAccounts,
}: ReelFeedProps) {
  const dict = useDict().feed.reelFeed;
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
    // First run: no accounts tracked yet → send them to the setup wizard rather
    // than telling them to "sync" something they haven't set up.
    if (!hasFilters && !hasAccounts) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-background px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-brand" />
          </span>
          <p className="text-sm font-medium text-foreground">{dict.setupTitle}</p>
          <p className="max-w-sm text-sm text-subtle">
            {dict.setupBody}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/dashboard/onboarding"
              className="flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {dict.setupCta}
            </Link>
            <Link
              href="/dashboard/accounts"
              className="flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              {dict.addManually}
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-background px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Inbox className="h-6 w-6 text-subtle" />
        </span>
        <p className="text-sm font-medium text-muted-foreground">
          {hasFilters ? dict.noFilterMatch : dict.noTracked}
        </p>
        <p className="max-w-sm text-sm text-subtle">
          {hasFilters ? dict.tryClearing : dict.runSync}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-subtle">
          {dict.shownCount(reels.length)}
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
