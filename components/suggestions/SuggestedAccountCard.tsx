"use client";

import { X } from "lucide-react";
import { TrackAccountButton } from "@/components/trends/TrackAccountButton";
import type { SuggestedAccount } from "@/lib/suggestions/accounts";
import { useDict } from "@/lib/i18n/I18nProvider";

export const SUGGESTIONS_HIDDEN_KEY = "reelspy.suggestions.hidden";

function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

type Props = {
  account: SuggestedAccount;
  niche?: string;
  onHide: (username: string) => void;
};

// One niche-suggested account (empty-state hero + ongoing strips). Reuses
// TrackAccountButton's zero-quota "seed from shared cache" tracking, tagged
// source="suggestions" so app_events can tell suggestion-driven adds apart
// from Niche Radar's own. Dismissal is client-only (localStorage) — no DB
// churn for a "not interested" click.
export function SuggestedAccountCard({ account, niche, onHide }: Props) {
  const dict = useDict();
  const t = dict.suggestions;

  const dismiss = () => {
    try {
      const raw = window.localStorage.getItem(SUGGESTIONS_HIDDEN_KEY);
      const current: string[] = raw ? JSON.parse(raw) : [];
      const key = account.igUsername.toLowerCase();
      if (!current.includes(key)) {
        window.localStorage.setItem(SUGGESTIONS_HIDDEN_KEY, JSON.stringify([...current, key]));
      }
    } catch {
      // localStorage unavailable (private mode) — dismissal just won't persist.
    }
    onHide(account.igUsername);
  };

  return (
    <div className="relative flex items-start gap-3 rounded-xl border border-border bg-card p-3">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.notInterested}
        title={t.notInterested}
        className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-subtle transition hover:bg-secondary hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {account.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={account.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-border-strong"
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
          {account.igUsername.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1 pe-6">
        <p className="truncate text-sm font-semibold text-foreground">@{account.igUsername}</p>
        <p className="text-xs text-subtle">
          {account.followers != null
            ? `${compact(account.followers)} ${dict.trends.card.followers}`
            : "—"}
        </p>
        {account.topReel && account.topReel.outperformRatio >= 1.3 ? (
          <p className="mt-1 text-xs text-success">
            {t.outperformBadge(account.topReel.outperformRatio.toFixed(1))}
          </p>
        ) : null}

        <div className="mt-2">
          <TrackAccountButton
            username={account.igUsername}
            niche={niche}
            initialTracked={false}
            source="suggestions"
          />
        </div>
      </div>
    </div>
  );
}
