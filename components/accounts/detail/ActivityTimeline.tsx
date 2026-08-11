"use client";

import { useState } from "react";
import {
  Archive,
  Download,
  FileText,
  FolderClosed,
  Heart,
  PauseCircle,
  Play,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { relativeTime } from "@/lib/i18n/intl";
import type { ActivityItem, ActivityKind } from "@/lib/accounts/activity";

const PAGE = 20;

const ICONS: Record<ActivityKind, React.ReactNode> = {
  account_tracked: <UserPlus className="h-3.5 w-3.5" />,
  reels_added: <Sparkles className="h-3.5 w-3.5" />,
  synced: <RefreshCw className="h-3.5 w-3.5" />,
  sync_throttled: <TriangleAlert className="h-3.5 w-3.5" />,
  archive_requested: <Archive className="h-3.5 w-3.5" />,
  archive_completed: <Archive className="h-3.5 w-3.5" />,
  transcribe_started: <FileText className="h-3.5 w-3.5" />,
  transcribe_failed: <TriangleAlert className="h-3.5 w-3.5" />,
  transcripts_ready: <FileText className="h-3.5 w-3.5" />,
  reel_favorited: <Star className="h-3.5 w-3.5" />,
  reel_worked: <Heart className="h-3.5 w-3.5" />,
  reel_discarded: <Trash2 className="h-3.5 w-3.5" />,
  script_generated: <Sparkles className="h-3.5 w-3.5" />,
  exported: <Download className="h-3.5 w-3.5" />,
  paused: <PauseCircle className="h-3.5 w-3.5" />,
  resumed: <Play className="h-3.5 w-3.5" />,
  group_changed: <FolderClosed className="h-3.5 w-3.5" />,
};

const WARNING_KINDS: ActivityKind[] = ["sync_throttled", "transcribe_failed"];

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.detail.activity;
  const [shown, setShown] = useState(PAGE);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-background p-5 text-sm text-muted-foreground">
        {t.empty}
      </div>
    );
  }

  const visible = items.slice(0, shown);

  return (
    <div>
      {/* Logical `border-s` / `start-0` so the rail flips to the right edge in
          Arabic without a second code path. */}
      <ol className="relative space-y-4 border-s border-border ps-5">
        {visible.map((item) => {
          const warn = WARNING_KINDS.includes(item.kind);
          return (
            <li key={item.id} className="relative">
              <span
                className={`absolute -start-[27px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-background ${
                  warn ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground"
                }`}
              >
                {ICONS[item.kind]}
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm text-foreground">{label(t.kinds, item)}</p>
                <time className="text-[11px] text-subtle" dateTime={item.at}>
                  {relativeTime(item.at, locale)}
                </time>
              </div>
              {item.label ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.label}</p>
              ) : null}
              {item.reel ? (
                <div className="mt-1.5 flex items-center gap-2">
                  {item.reel.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.reel.thumbnail_url}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 shrink-0 rounded-md object-cover"
                    />
                  ) : null}
                  <p className="truncate text-xs text-subtle">{item.reel.caption}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {shown < items.length ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setShown((n) => n + PAGE)}
        >
          {t.showMore}
        </Button>
      ) : null}
    </div>
  );
}

type Kinds = ReturnType<typeof useDict>["accounts"]["detail"]["activity"]["kinds"];

function label(kinds: Kinds, item: ActivityItem): string {
  const entry = kinds[item.kind];
  return typeof entry === "function" ? entry(item.count ?? 0) : entry;
}
