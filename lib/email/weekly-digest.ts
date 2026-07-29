// Weekly niche digest email (V3/W6). Composes the HTML + text for a per-user
// digest: the week's top rising reels, a few saved-hook nudges, and a WLC
// ("Weekly Loop Completion") prompt. Pure formatting on the shared branded
// template (lib/email/layout.ts) — the cron gathers the data and calls sendEmail.
// Server-only.

import "server-only";
import { buildEmail, type EmailBlock } from "./layout";

export type DigestReel = {
  reelId: string;
  username: string;
  caption: string | null;
  permalink: string;
  score: number;
};

export type DigestHook = {
  text: string;
  reelId: string | null;
};

export type WeeklyDigestData = {
  siteOrigin: string;
  risingReels: DigestReel[];
  hooks: DigestHook[];
  researchedCount: number; // reels tracked in the last 7 days
  scriptsCount: number; // scripts generated in the last 7 days
  unsubscribeUrl: string | null;
};

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// The WLC nudge — tailored to where the user is in the research→script loop.
function loopNudge(researched: number, scripts: number): string {
  if (researched > 0 && scripts === 0) {
    return `You researched ${researched} reel${researched === 1 ? "" : "s"} last week but turned 0 into a script. Your next post is one click away.`;
  }
  if (researched === 0 && scripts === 0) {
    return `Quiet week — sync your accounts to see what's taking off in your niche, then turn the best reel into a script.`;
  }
  if (scripts > 0) {
    return `You shipped ${scripts} script${scripts === 1 ? "" : "s"} from ${researched} reel${researched === 1 ? "" : "s"} last week. Keep the loop going.`;
  }
  return `Here's what's rising in your niche this week.`;
}

export function buildWeeklyDigest(data: WeeklyDigestData): {
  subject: string;
  html: string;
  text: string;
} {
  const { siteOrigin, risingReels, hooks, researchedCount, scriptsCount, unsubscribeUrl } = data;
  const nudge = loopNudge(researchedCount, scriptsCount);

  const topUser = risingReels[0]?.username;
  const subject = topUser
    ? `This week in your niche: @${topUser} and ${Math.max(0, risingReels.length - 1)} more rising`
    : `Your weekly ReelSpy digest`;

  const blocks: EmailBlock[] = [{ kind: "paragraph", text: nudge }];

  if (risingReels.length > 0) {
    blocks.push({
      kind: "linkList",
      caption: "Rising in your niche",
      items: risingReels.map((r) => ({
        title: `@${r.username}`,
        meta: `score ${Math.round(r.score).toLocaleString("en-US")}`,
        subtitle: truncate(r.caption ?? "No caption", 90),
        href: `${siteOrigin}/dashboard/generate/${r.reelId}`,
        linkLabel: "Write a script",
      })),
    });
  } else {
    blocks.push({
      kind: "paragraph",
      text: "No new rising reels this week — sync your accounts to refresh your feed.",
    });
  }

  if (hooks.length > 0) {
    blocks.push({
      kind: "linkList",
      caption: "Hooks to reuse",
      items: hooks.map((h) => ({
        title: `“${truncate(h.text, 120)}”`,
        href: `${siteOrigin}/dashboard/scripts?hook=${encodeURIComponent(h.text)}`,
        linkLabel: "Use this hook",
      })),
    });
  }

  const { html, text } = buildEmail({
    eyebrow: "Weekly digest",
    preheader: nudge,
    title: "Your weekly niche digest",
    blocks,
    cta: { href: `${siteOrigin}/dashboard/feed`, label: "Open ReelSpy" },
    reason: "You're receiving this weekly digest because it's switched on in your ReelSpy settings.",
    unsubscribeUrl,
  });

  return { subject, html, text };
}
