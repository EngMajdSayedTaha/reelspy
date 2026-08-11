import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { readAccountDetail } from "@/lib/accounts/detail";
import {
  cadenceSummary,
  captionBuckets,
  distributionSummary,
  engagementSummary,
  hashtagStats,
  matureTrend,
  mentionStats,
  rankByViews,
  toTimePoints,
  transcriptCoverage,
  viewsTimeline,
} from "@/lib/accounts/metrics";
import { AccountHeader } from "@/components/accounts/detail/AccountHeader";
import { SectionNav } from "@/components/accounts/detail/SectionNav";
import { CoverageStrip } from "@/components/accounts/detail/CoverageStrip";
import { AccountKpis } from "@/components/accounts/detail/AccountKpis";
import { PerformanceSection } from "@/components/accounts/detail/PerformanceSection";
import { PostingPatterns } from "@/components/accounts/detail/PostingPatterns";
import { ContentInsights } from "@/components/accounts/detail/ContentInsights";
import { FollowerHistoryCard } from "@/components/accounts/detail/FollowerHistoryCard";
import { ActivityTimeline } from "@/components/accounts/detail/ActivityTimeline";
import {
  AccountManagePanel,
  AccountSyncControls,
} from "@/components/accounts/detail/AccountActionBar";
import { ReelRow } from "@/components/reels/ReelRow";
import { PageTourButton } from "@/components/tour/PageTourButton";
import {
  markReelAsWorkedOn,
  setReelDiscarded,
  setReelFavorited,
} from "@/app/dashboard/feed/actions";
import {
  assignAccountGroup,
  removeInspirationAccount,
  toggleAccountActive,
} from "../actions";

/** Below this, distributions and trends are noise dressed as insight. */
const MIN_REELS_FOR_CHARTS = 4;
/** Reels listed inline before deferring to the Feed page. */
const INLINE_REELS = 12;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { title: "ReelSpy" };

  const { data } = await supabase
    .from("inspiration_accounts")
    .select("ig_username")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  return { title: data ? `@${data.ig_username} · ReelSpy` : "ReelSpy" };
}

export default async function AccountDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.accounts.detail;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The archive, jobs, app_events and metric-history tables are all RLS-locked
  // with no policies, so they need the service-role client. A missing key must
  // cost those panels, not the page.
  let admin = null;
  try {
    admin = createAdminClient();
  } catch (adminError) {
    console.warn(
      "[account-detail] admin client unavailable:",
      adminError instanceof Error ? adminError.message : adminError
    );
  }

  const detail = await readAccountDetail(supabase, admin, user.id, id);

  // A foreign account id is indistinguishable from a missing one here — RLS
  // filtered it out — and both are honestly a 404. Not a redirect: the user
  // reaches this page with the Back button after removing an account, and a
  // silent bounce to the grid reads as a bug.
  if (!detail) {
    notFound();
  }

  const { account, aggregates, reels, archive, transcribe, history, activity, outperformers } =
    detail;

  const hasReels = reels.length > 0;
  const hasEnoughForCharts = reels.length >= MIN_REELS_FOR_CHARTS;

  const engagement = engagementSummary(reels, account.followers_count);
  const distribution = distributionSummary(reels);
  const cadence = cadenceSummary(reels);
  const trend = matureTrend(reels);
  const timeline = viewsTimeline(reels);
  const timePoints = toTimePoints(reels);
  const { top, bottom } = rankByViews(reels);
  const hashtags = hashtagStats(reels);
  const mentions = mentionStats(reels);
  const captions = captionBuckets(reels);

  // Prefer the RPC's full-set transcript counts; fall back to the window.
  const windowCoverage = transcriptCoverage(reels);
  const transcripts = aggregates.exact
    ? {
        ready: aggregates.transcriptsReady,
        failed: aggregates.transcriptsFailed,
        total: aggregates.reelsTotal,
        pct: aggregates.reelsTotal
          ? (aggregates.transcriptsReady / aggregates.reelsTotal) * 100
          : null,
      }
    : windowCoverage;

  const sections = [
    ...(hasEnoughForCharts ? ["performance", "patterns"] : []),
    ...(hasReels ? ["content", "reels"] : []),
    "activity",
    "manage",
  ];

  return (
    <div className="space-y-6">
      <AccountHeader
        account={account}
        tour={<PageTourButton page="accountDetail" />}
        actions={<AccountSyncControls account={account} />}
      />

      {hasReels ? <SectionNav sections={sections} /> : null}

      <div data-tour="account-coverage">
        <CoverageStrip aggregates={aggregates} archive={archive} />
      </div>

      {!hasReels ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-background p-6 text-center">
          <p className="text-base font-medium text-foreground">{t.empty.title}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t.empty.desc}</p>
        </div>
      ) : (
        <>
          <div data-tour="account-kpis">
            <AccountKpis
              aggregates={aggregates}
              engagement={engagement}
              distribution={distribution}
              cadence={cadence}
              followers={account.followers_count}
              trendDelta={trend.deltaPct}
            />
          </div>

          {!hasEnoughForCharts ? (
            <p className="rounded-xl border border-dashed border-border-strong bg-background p-4 text-sm text-muted-foreground">
              {t.empty.tooFew}
            </p>
          ) : (
            <>
              <section
                id="performance"
                data-tour="account-performance"
                className="scroll-mt-28 space-y-4"
              >
                <SectionHeading>{t.performance.title}</SectionHeading>
                <FollowerHistoryCard
                  history={history}
                  currentFollowers={account.followers_count}
                />
                <PerformanceSection
                  timeline={timeline}
                  distribution={distribution}
                  trend={trend}
                  medianViews={aggregates.viewsMedian}
                  p90Views={aggregates.viewsP90}
                />
              </section>

              <section
                id="patterns"
                data-tour="account-patterns"
                className="scroll-mt-28 space-y-4"
              >
                <SectionHeading>{t.patterns.title}</SectionHeading>
                <PostingPatterns points={timePoints} cadence={cadence} />
              </section>
            </>
          )}

          <section id="content" data-tour="account-content" className="scroll-mt-28 space-y-4">
            <SectionHeading>{t.content.title}</SectionHeading>
            <ContentInsights
              top={top}
              bottom={bottom}
              outperformers={outperformers}
              hashtags={hashtags}
              mentions={mentions}
              captions={captions}
              transcripts={transcripts}
            />
          </section>

          <section id="reels" className="scroll-mt-28 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionHeading>{t.reels.title}</SectionHeading>
              <Link
                href={`/dashboard/feed?account=${account.id}`}
                className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.reels.seeAll}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </div>
            <div className="space-y-2">
              {reels
                .slice(0, INLINE_REELS)
                .filter((reel) => reel.ig_permalink)
                .map((reel) => (
                  <ReelRow
                    key={reel.id}
                    // ReelRow was built for the Feed, where every row carries its
                    // own account. Here the account is the page, so it is filled
                    // in from the header rather than re-fetched per row.
                    reel={{
                      ...reel,
                      ig_permalink: reel.ig_permalink as string,
                      viral_score: Number(reel.viral_score ?? 0),
                      is_discarded: false,
                      inspiration_accounts: {
                        ig_username: account.ig_username,
                        display_name: account.display_name,
                        avatar_url: account.avatar_url,
                      },
                    }}
                    markWorkedAction={markReelAsWorkedOn}
                    discardAction={setReelDiscarded}
                    favoriteAction={setReelFavorited}
                  />
                ))}
            </div>
          </section>
        </>
      )}

      <section id="activity" data-tour="account-activity" className="scroll-mt-28 space-y-4">
        <SectionHeading>{t.activity.title}</SectionHeading>
        <p className="-mt-2 text-sm text-muted-foreground">{t.activity.subtitle}</p>
        <ActivityTimeline items={activity} />
      </section>

      <section id="manage" className="scroll-mt-28 space-y-4">
        <SectionHeading>{t.manage.title}</SectionHeading>
        <AccountManagePanel
          account={account}
          groups={detail.groups}
          archive={archive}
          transcribing={
            transcribe?.state === "queued" ||
            transcribe?.state === "running" ||
            transcribe?.state === "paused"
          }
          assignGroupAction={assignAccountGroup}
          toggleActiveAction={toggleAccountActive}
          removeAction={removeInspirationAccount}
        />
      </section>

      {/* Said plainly where a manager would look for it. Silently omitting
          reach/saves/watch-time reads as a gap in the product rather than a
          hard limit of Instagram's Business Discovery API. */}
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Info className="h-4 w-4 text-subtle" />
          {t.unavailable.title}
        </h3>
        <p className="mt-1.5 text-xs text-muted-foreground">{t.unavailable.desc}</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {t.unavailable.items.map((item) => (
            <li
              key={item}
              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t.unavailable.velocity}</p>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-foreground">{children}</h2>;
}
