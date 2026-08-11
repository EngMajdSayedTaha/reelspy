"use client";

export type LeaderboardEntry = {
  id: string;
  /** Single-line label — captions are collapsed/truncated by the caller. */
  title: string;
  thumbnail?: string | null;
  /** Drives the proportional bar. */
  value: number;
  /** Pre-formatted headline number. */
  valueLabel: string;
  subLabel?: string | null;
  href?: string | null;
};

/**
 * Ranked list with proportional bars. Generalized out of
 * `InsightsCharts.TopPerformers` so it can rank anything — top reels, bottom
 * reels, hashtags — not just `MediaItem`s with an `insights` object.
 *
 * `ascending` flips the highlight to the *last* entry, which is what a
 * "weakest posts" list wants: the bar still shows relative size, but rank 1 is
 * no longer the hero.
 */
export function Leaderboard({
  entries,
  highlightFirst = true,
}: {
  entries: LeaderboardEntry[];
  highlightFirst?: boolean;
}) {
  if (entries.length === 0) return null;

  const max = Math.max(1, ...entries.map((e) => e.value));

  return (
    <ol className="space-y-2">
      {entries.map((entry, i) => {
        const hero = highlightFirst && i === 0;
        const Row = entry.href ? "a" : "div";
        return (
          <li key={entry.id}>
            <Row
              {...(entry.href
                ? { href: entry.href, target: "_blank", rel: "noreferrer" }
                : {})}
              className={`group flex items-center gap-2.5 rounded-lg p-1.5 transition-colors ${
                entry.href ? "hover:bg-secondary" : ""
              }`}
            >
              <span
                className={`w-4 shrink-0 text-center text-xs font-semibold ${
                  hero ? "text-brand" : "text-subtle"
                }`}
              >
                {i + 1}
              </span>
              {entry.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.thumbnail}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-md bg-border" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">{entry.title}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className={`h-full rounded-full ${
                      hero ? "bg-primary" : "bg-border-strong group-hover:bg-border-strong"
                    }`}
                    style={{ width: `${Math.max((entry.value / max) * 100, 2)}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-xs font-semibold text-foreground">{entry.valueLabel}</p>
                {entry.subLabel ? <p className="text-[10px] text-subtle">{entry.subLabel}</p> : null}
              </div>
            </Row>
          </li>
        );
      })}
    </ol>
  );
}
