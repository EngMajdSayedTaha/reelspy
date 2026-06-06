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
};

export function RisingNow({ reels, groups, currentGroup, markWorkedAction }: RisingNowProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-[#F9E400]" />
          <h2 className="text-lg font-semibold text-white">Rising now</h2>
          <span className="hidden text-xs text-zinc-500 sm:inline">
            Fastest-growing reels by engagement-per-hour (last 30 days)
          </span>
        </div>

        {groups.length > 0 ? <RisingGroupFilter groups={groups} current={currentGroup} /> : null}
      </div>

      {reels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#262626] bg-[#0f0f0f] px-4 py-6 text-center text-sm text-zinc-500">
          No rising reels in this group yet.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {reels.map((reel) => (
            <div key={reel.id} className="w-[280px] shrink-0">
              <ReelCard reel={reel} markWorkedAction={markWorkedAction} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
