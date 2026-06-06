import { Flame } from "lucide-react";
import { ReelCard } from "@/components/reels/ReelCard";
import type { FeedReel } from "@/app/dashboard/feed/page";

type RisingNowProps = {
  reels: FeedReel[];
  markWorkedAction: (formData: FormData) => Promise<void>;
};

export function RisingNow({ reels, markWorkedAction }: RisingNowProps) {
  if (reels.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-[#F9E400]" />
        <h2 className="text-lg font-semibold text-white">Rising now</h2>
        <span className="text-xs text-zinc-500">Fastest-growing reels by engagement-per-hour (last 30 days)</span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {reels.map((reel) => (
          <div key={reel.id} className="w-[280px] shrink-0">
            <ReelCard reel={reel} markWorkedAction={markWorkedAction} />
          </div>
        ))}
      </div>
    </section>
  );
}
