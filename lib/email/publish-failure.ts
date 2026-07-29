// Publish-failure summary email (L9 / B4). Composes a per-platform failure
// digest on the shared branded template (lib/email/layout.ts) and sends it via
// `sendEmail`. Server-only, fail-open — a broken or unconfigured notification
// must never affect the publish result.

import "server-only";
import { sendEmail } from "./send";
import { buildEmail, type EmailBlock } from "./layout";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { getSiteUrl } from "@/lib/site";

export type FailedTarget = {
  platform: Platform;
  error: string;
};

// Sends one summary email when a post finishes with at least one failed target.
// `published` is the count of targets that succeeded (so the copy can say
// "partial" vs "all failed"). Returns whether the email was accepted.
export async function notifyPublishFailure(params: {
  to: string;
  postTitle: string;
  published: number;
  failed: FailedTarget[];
}): Promise<boolean> {
  const { to, postTitle, published, failed } = params;
  if (failed.length === 0) return false;

  const deepLink = `${getSiteUrl()}/dashboard/publishing`;
  const partial = published > 0;
  const title = partial
    ? `Your post published to ${published} platform${published === 1 ? "" : "s"}, but ${failed.length} failed`
    : `Your post couldn't be published`;

  const blocks: EmailBlock[] = [
    {
      kind: "paragraph",
      text: partial
        ? `Part of this post went out. The platforms below rejected it and are waiting for a retry — the ones that succeeded are already live and are never re-posted.`
        : `None of the targets accepted this post. Nothing was published, so retrying is safe.`,
    },
    {
      kind: "rows",
      caption: "Post",
      rows: [
        { label: "Title", value: postTitle, emphasis: true },
        { label: "Published", value: `${published} platform${published === 1 ? "" : "s"}` },
        { label: "Failed", value: `${failed.length} platform${failed.length === 1 ? "" : "s"}` },
      ],
    },
    {
      kind: "bullets",
      caption: "What went wrong",
      items: failed.map((f) => `${PLATFORM_LABELS[f.platform]}: ${f.error}`),
    },
  ];

  const { html, text } = buildEmail({
    eyebrow: "Publishing",
    preheader: `${failed.length} platform${failed.length === 1 ? "" : "s"} rejected "${postTitle}".`,
    title,
    blocks,
    cta: { href: deepLink, label: "Review & retry" },
    footnote:
      "Retrying a failed platform re-runs only that target — successful posts are never duplicated.",
    reason: "You're receiving this because a post you scheduled in ReelSpy didn't fully publish.",
  });

  return sendEmail({
    to,
    subject: partial ? `Partial publish — ${failed.length} platform(s) failed` : `Publish failed`,
    html,
    text,
  });
}
