import { Flame } from "lucide-react";
import { ReelCard } from "@/components/reels/ReelCard";
import { RisingGroupFilter } from "@/components/reels/RisingGroupFilter";
import type { FeedReel } from "@/app/dashboard/feed/page";

type Group = { id: string; name: string };

type RisingNowProps = {
  reels: FeedReel[];
  groups: Group[];
  currentGroup: string;
  markWorkedAction: (formData: FormData) => Promise<void>;
  discardAction: (formData: FormData) => Promise<void>;
  favoriteAction: (formData: FormData) => Promise<void>;
};

export function RisingNow({
  reels,
  groups,
  currentGroup,
  markWorkedAction,
  discardAction,
  favoriteAction,
}: RisingNowProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold text-foreground">Rising now</h2>
          <span className="hidden text-xs text-subtle sm:inline">
            Fastest-growing reels by engagement-per-hour (last 30 days)
          </span>
        </div>

        {groups.length > 0 ? <RisingGroupFilter groups={groups} current={currentGroup} /> : null}
      </div>

      {reels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-background px-4 py-6 text-center text-sm text-subtle">
          No rising reels in this group yet.
        </div>
      ) : (
        // Bleeds to the screen edge on phones so the 340px cards fit and
        // scroll-snap one at a time.
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:snap-none sm:px-0">
          {reels.map((reel) => (
            // Min 340px: Instagram's /embed iframe renders blank below ~326px,
            // which is why inline play looked broken in this rail.
            <div key={reel.id} className="w-[340px] shrink-0 snap-center sm:snap-align-none">
              <ReelCard
              reel={reel}
              markWorkedAction={markWorkedAction}
              discardAction={discardAction}
              favoriteAction={favoriteAction}
            />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
