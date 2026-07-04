// Weekly niche digest email (V3/W6). Composes the HTML + text for a per-user
// digest: the week's top rising reels, a few saved-hook nudges, and a WLC
// ("Weekly Loop Completion") prompt. Pure formatting — the cron gathers the data
// and calls sendEmail. Server-only.

import "server-only";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  const reelRows = risingReels
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #E2E8F0">
          <div style="font-size:14px;color:#0F172A">
            <strong>@${escapeHtml(r.username)}</strong>
            <span style="color:#64748B"> · score ${Math.round(r.score).toLocaleString("en-US")}</span>
          </div>
          <div style="font-size:13px;color:#475569;margin:2px 0 6px">${escapeHtml(truncate(r.caption ?? "No caption", 90))}</div>
          <a href="${siteOrigin}/dashboard/generate/${r.reelId}" style="font-size:13px;color:#6D28D9;font-weight:600;text-decoration:none">Write a script →</a>
          <a href="${escapeHtml(r.permalink)}" style="font-size:13px;color:#94A3B8;text-decoration:none;margin-left:12px">View reel</a>
        </td>
      </tr>`
    )
    .join("");

  const hookRows = hooks
    .map(
      (h) => `
      <li style="margin-bottom:8px;font-size:13px;color:#0F172A">
        &ldquo;${escapeHtml(truncate(h.text, 120))}&rdquo;
        <a href="${siteOrigin}/dashboard/scripts?hook=${encodeURIComponent(h.text)}" style="color:#6D28D9;text-decoration:none;font-weight:600;margin-left:6px">Use →</a>
      </li>`
    )
    .join("");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0F172A;max-width:560px;margin:0 auto;padding:8px">
    <h1 style="font-size:20px;margin:0 0 4px">Your weekly niche digest</h1>
    <p style="font-size:14px;color:#475569;margin:0 0 20px">${escapeHtml(nudge)}</p>

    ${
      risingReels.length > 0
        ? `<h2 style="font-size:15px;margin:0 0 4px">Rising in your niche</h2>
           <table style="width:100%;border-collapse:collapse;margin-bottom:20px">${reelRows}</table>`
        : `<p style="font-size:14px;color:#475569;margin:0 0 20px">No new rising reels this week — <a href="${siteOrigin}/dashboard/feed" style="color:#6D28D9">sync your accounts</a> to refresh.</p>`
    }

    ${
      hooks.length > 0
        ? `<h2 style="font-size:15px;margin:0 0 8px">Hooks to reuse</h2>
           <ul style="padding-left:18px;margin:0 0 20px">${hookRows}</ul>`
        : ""
    }

    <a href="${siteOrigin}/dashboard/feed"
       style="display:inline-block;background:#6D28D9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">
      Open ReelSpy
    </a>

    <p style="font-size:12px;color:#94A3B8;margin:24px 0 0;border-top:1px solid #E2E8F0;padding-top:12px">
      You're getting this weekly digest from ReelSpy.${
        unsubscribeUrl
          ? ` <a href="${unsubscribeUrl}" style="color:#94A3B8">Unsubscribe</a>.`
          : ""
      }
    </p>
  </div>`;

  const textLines = [
    "Your weekly niche digest",
    "",
    nudge,
    "",
    ...(risingReels.length > 0
      ? [
          "Rising in your niche:",
          ...risingReels.map(
            (r) => `- @${r.username} (score ${Math.round(r.score)}): ${siteOrigin}/dashboard/generate/${r.reelId}`
          ),
          "",
        ]
      : []),
    ...(hooks.length > 0
      ? ["Hooks to reuse:", ...hooks.map((h) => `- "${truncate(h.text, 120)}"`), ""]
      : []),
    `Open ReelSpy: ${siteOrigin}/dashboard/feed`,
    ...(unsubscribeUrl ? ["", `Unsubscribe: ${unsubscribeUrl}`] : []),
  ];

  return { subject, html, text: textLines.join("\n") };
}
