import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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

type ReelCardProps = {
  reel: Reel;
  markWorkedAction: (formData: FormData) => Promise<void>;
};

function getSourceUsername(reel: Reel): string {
  if (!reel.inspiration_accounts) {
    return "unknown";
  }

  if (Array.isArray(reel.inspiration_accounts)) {
    return reel.inspiration_accounts[0]?.ig_username ?? "unknown";
  }

  return reel.inspiration_accounts.ig_username;
}

function formatNumber(value: number | null): string {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

export function ReelCard({ reel, markWorkedAction }: ReelCardProps) {
  const sourceUsername = getSourceUsername(reel);

  return (
    <article className="space-y-4 rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-zinc-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-400">Source: @{sourceUsername}</p>
          <a
            href={reel.ig_permalink}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-[#F9E400] underline-offset-4 hover:underline"
          >
            Open Reel
          </a>
        </div>

        <Badge variant={reel.is_worked_on ? "default" : "outline"}>
          {reel.is_worked_on ? "Worked On" : "New"}
        </Badge>
      </div>

      <p className="line-clamp-3 text-sm text-zinc-200">{reel.caption ?? "No caption available."}</p>

      <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
        <p>Views: {formatNumber(reel.view_count)}</p>
        <p>Likes: {formatNumber(reel.like_count)}</p>
        <p>Comments: {formatNumber(reel.comment_count)}</p>
        <p>Viral Score: {formatNumber(reel.viral_score)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href={`/dashboard/generate/${reel.id}`}>Generate Script</Link>
        </Button>

        <form action={markWorkedAction}>
          <input type="hidden" name="reel_id" value={reel.id} />
          <Button type="submit" variant={reel.is_worked_on ? "outline" : "default"}>
            Mark as Worked On
          </Button>
        </form>

        {reel.posted_at ? (
          <p className="text-xs text-zinc-400">
            Posted {new Date(reel.posted_at).toLocaleDateString("en-US")}
          </p>
        ) : null}
      </div>
    </article>
  );
}
