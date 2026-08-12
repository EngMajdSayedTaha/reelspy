"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MyReelsInsights } from "@/components/instagram/MyReelsInsights";
import type { ProfileSummary } from "@/lib/instagram/insights-export";
import { useDict } from "@/lib/i18n/I18nProvider";

function formatNumber(n: number | null | undefined) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type MyAccountOverviewProps = {
  initialProfile: ProfileSummary | null;
  connected: boolean;
  /** Fallback label when there's no synced Instagram profile yet. */
  fallbackName: string;
  igLoadError?: string | null;
  /** Rendered between the overview header and the reels grid (e.g. GrowthNotes). */
  children?: ReactNode;
};

export function MyAccountOverview({
  initialProfile,
  connected,
  fallbackName,
  igLoadError,
  children,
}: MyAccountOverviewProps) {
  const fullDict = useDict();
  const dict = fullDict.myAccount;
  // Shared with MyReelsInsights: "Sync my reels" there updates this state too,
  // so the header (avatar, username, follower/post counts) never goes stale.
  const [profile, setProfile] = useState<ProfileSummary | null>(initialProfile);

  return (
    <>
      {igLoadError ? (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-warning">
          {igLoadError}
        </div>
      ) : null}

      <section data-tour="profile-snapshot" className="rounded-xl border border-border bg-card p-5 text-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            src={profile?.profile_picture_url}
            name={profile?.username ?? fallbackName}
            className="h-16 w-16 text-xl"
          />

          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-foreground">
              {profile?.username ? `@${profile.username}` : fallbackName}
            </p>
            <p className={`text-sm ${connected ? "text-success" : "text-danger"}`}>
              {connected ? fullDict.shell.connected : fullDict.shell.notConnected}
            </p>
            {profile?.biography ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{profile.biography}</p>
            ) : null}
          </div>

          <div className="flex gap-6 text-center">
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {profile ? formatNumber(profile.followers_count) : "—"}
              </p>
              <p className="text-xs text-subtle">{dict.followers}</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {profile ? formatNumber(profile.media_count) : "—"}
              </p>
              <p className="text-xs text-subtle">{dict.posts}</p>
            </div>
          </div>
        </div>

        <div data-tour="connection-actions" className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/connections">{dict.manageConnection}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/feed">{dict.goToFeed}</Link>
          </Button>
        </div>
      </section>

      {children}

      <MyReelsInsights connected={connected} onProfileUpdate={setProfile} />
    </>
  );
}
