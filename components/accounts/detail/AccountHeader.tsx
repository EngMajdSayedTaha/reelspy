"use client";

import Link from "next/link";
import { ArrowLeft, AtSign, ExternalLink, FolderClosed, PauseCircle, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRetryableImage } from "@/lib/hooks/useRetryableImage";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { relativeTime } from "@/lib/i18n/intl";
import { formatCompact } from "@/lib/instagram/insights-export";
import type { AccountRow } from "@/lib/accounts/detail";

export function AccountHeader({
  account,
  actions,
  tour,
}: {
  account: AccountRow;
  /** Compact sync controls, rendered by the page so this stays presentational. */
  actions?: React.ReactNode;
  /** The "?" page-tour button, beside the handle like every other page. */
  tour?: React.ReactNode;
}) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.detail;
  const card = dict.accounts.card;
  const avatar = useRetryableImage(account.avatar_url);
  const isActive = account.is_active !== false;

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {/* A left arrow points the wrong way in Arabic. */}
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t.backToAccounts}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {account.avatar_url && !avatar.failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={avatar.retryKey}
              src={account.avatar_url}
              alt={`@${account.ig_username}`}
              referrerPolicy="no-referrer"
              onError={avatar.onError}
              className={`h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-border-strong ${
                isActive ? "" : "grayscale"
              }`}
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
              <AtSign className="h-7 w-7 text-subtle" />
            </span>
          )}

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold text-foreground sm:text-3xl">
                @{account.ig_username}
              </h1>
              {tour}
              <Badge
                variant={isActive ? "default" : "outline"}
                className={isActive ? "" : "border-warning/50 bg-warning/15 text-warning"}
              >
                {isActive ? card.activeBadge : card.pausedBadge}
              </Badge>
            </div>

            {account.display_name && account.display_name !== account.ig_username ? (
              <p className="truncate text-sm text-muted-foreground">{account.display_name}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {formatCompact(account.followers_count)} {card.followersSuffix}
              </span>
              {account.group_name ? (
                <span className="flex items-center gap-1.5">
                  <FolderClosed className="h-3.5 w-3.5" />
                  {account.group_name}
                </span>
              ) : null}
              <span>
                {card.lastSyncLabel}{" "}
                {account.last_synced_at ? relativeTime(account.last_synced_at, locale) : card.never}
              </span>
              <a
                href={`https://www.instagram.com/${account.ig_username}/`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t.openOnInstagram}
              </a>
            </div>
          </div>
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {!isActive ? (
        <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-warning">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t.pausedBanner}</span>
        </div>
      ) : null}
    </div>
  );
}
