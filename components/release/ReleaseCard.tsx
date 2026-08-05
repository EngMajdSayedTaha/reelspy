"use client";

import { Sparkles, ArrowUpCircle, Wrench } from "lucide-react";
import type { Change, ChangeKind, Release } from "@/lib/release/types";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { intlLocale } from "@/lib/i18n/intl";

// One release, rendered identically on the What's New page and inside the
// one-time dialog — so a note can never read differently depending on where you
// happen to see it. Takes the release as plain data, which keeps the whole
// changelog out of every other page's bundle: only the page that needs a given
// release serializes it across.

const KIND_STYLES: Record<ChangeKind, { icon: typeof Sparkles; className: string }> = {
  new: { icon: Sparkles, className: "bg-accent-brand/12 text-accent-brand" },
  improved: { icon: ArrowUpCircle, className: "bg-primary/12 text-primary" },
  fixed: { icon: Wrench, className: "bg-secondary text-muted-foreground" },
};

// Stable within a release so the eye can group them: everything new, then every
// improvement, then the fixes — regardless of the order they were written in.
const KIND_ORDER: ChangeKind[] = ["new", "improved", "fixed"];

function sortChanges(changes: Change[]): Change[] {
  return [...changes].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  );
}

type Props = {
  release: Release;
  /** Marks the version the user is running right now. */
  isCurrent?: boolean;
  /** Inside the dialog the card is already framed, so it drops its own border. */
  bare?: boolean;
};

export function ReleaseCard({ release, isCurrent = false, bare = false }: Props) {
  const locale = useLocale();
  const t = useDict().release;

  const released = new Date(`${release.date}T00:00:00Z`).toLocaleDateString(
    intlLocale(locale),
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
  );

  return (
    <article
      className={
        bare ? "" : "rounded-2xl border border-border bg-card p-5 sm:p-6"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-xs font-medium text-foreground">
          {t.versionShort(release.version)}
        </span>
        <time dateTime={release.date} className="text-xs text-subtle">
          {released}
        </time>
        {isCurrent ? (
          <span className="rounded-full bg-accent-brand/12 px-2.5 py-0.5 text-xs font-medium text-accent-brand">
            {t.currentBadge}
          </span>
        ) : null}
      </div>

      <h2 className="mt-2 text-lg font-semibold text-foreground sm:text-xl">
        {release.title[locale]}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {release.summary[locale]}
      </p>

      <ul className="mt-4 space-y-2.5">
        {sortChanges(release.changes).map((change, index) => {
          const { icon: Icon, className } = KIND_STYLES[change.kind];
          return (
            <li key={index} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[0.7rem] font-medium ${className}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {t.kinds[change.kind]}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
                {change.text[locale]}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
