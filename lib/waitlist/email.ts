// Waiting-list transactional email. Two moments matter: "we got you" (the
// confirmation, which is what stops people re-submitting and emailing support)
// and "you're in" (the approval, which is the whole point of the queue).
//
// Same posture as every other sender here: fail-open. `sendEmail` returns false
// rather than throwing when Resend isn't provisioned, so an unconfigured
// mailbox costs a notification and never an approval.

import "server-only";
import { sendEmail } from "@/lib/email/send";
import { buildEmail, type EmailBlock } from "@/lib/email/layout";
import { getSiteUrl } from "@/lib/site";

/** "You're on the list" — sent once, when the entry is first created. */
export async function sendWaitlistConfirmation(params: {
  to: string;
  name?: string | null;
  queueNumber: number;
  total: number;
}): Promise<boolean> {
  const { to, name, queueNumber, total } = params;
  const greeting = name?.trim() ? `${name.trim()}, you're on the list.` : "You're on the list.";

  const blocks: EmailBlock[] = [
    {
      kind: "paragraph",
      text: "ReelSpy is in closed beta while we make sure every account gets real Instagram data and fast AI scripts on day one. We're letting people in a batch at a time.",
    },
    {
      kind: "rows",
      caption: "Your place",
      rows: [
        { label: "Ticket", value: `#${queueNumber}`, emphasis: true },
        { label: "On the list", value: `${total} creator${total === 1 ? "" : "s"}` },
      ],
    },
    {
      kind: "bullets",
      caption: "What happens next",
      items: [
        "We email you the moment your access opens — nothing else to do.",
        "Signing in with the same address is what links your account, so use this one.",
        "Replying to this email with your niche moves you up: we prioritise accounts we can show great data for immediately.",
      ],
    },
  ];

  const { html, text } = buildEmail({
    eyebrow: "Waiting list",
    preheader: `You're #${queueNumber} in line for ReelSpy.`,
    title: greeting,
    blocks,
    cta: { href: `${getSiteUrl()}/waitlist`, label: "Check your place" },
    reason: "You asked for early access to ReelSpy.",
  });

  return sendEmail({ to, subject: `You're #${queueNumber} on the ReelSpy waiting list`, html, text });
}

/** "You're in" — sent when an admin approves the entry. */
export async function sendWaitlistApproval(params: {
  to: string;
  name?: string | null;
  /** True when the applicant already has an account, so the copy says sign IN. */
  hasAccount: boolean;
}): Promise<boolean> {
  const { to, name, hasAccount } = params;
  const site = getSiteUrl();

  const blocks: EmailBlock[] = [
    {
      kind: "paragraph",
      text: hasAccount
        ? "Your access is open. Sign in with this address and the dashboard is waiting for you — nothing was lost while you were in the queue."
        : "Your access is open. Create your account with THIS email address (Google or a password, whichever you prefer) and you'll go straight in.",
    },
    {
      kind: "callout",
      text: "Use this exact email address — access is granted to the address you joined the list with.",
      tone: "warn",
    },
    {
      kind: "bullets",
      caption: "A good first 10 minutes",
      items: [
        "Add 3–5 creators you learn from as inspiration accounts.",
        "Open the feed sorted by out-performance — those are the reels worth studying.",
        "Pick one winner and let ReelSpy write the script in your voice.",
      ],
    },
  ];

  // The !hasAccount case carries the address as a query param: while the
  // waiting list is on, /signup shows the join form to every visitor by
  // default (it has no other way to know who's asking) — the param is what
  // lets it verify THIS address server-side and swap in the real account
  // form instead. See isEmailApproved() and app/signup/page.tsx.
  const signupHref = `${site}/signup?email=${encodeURIComponent(to)}`;

  const { html, text } = buildEmail({
    eyebrow: "Waiting list",
    preheader: "Your ReelSpy access is open.",
    title: name?.trim() ? `${name.trim()}, you're in.` : "You're in.",
    blocks,
    cta: { href: hasAccount ? `${site}/login` : signupHref, label: hasAccount ? "Sign in" : "Create your account" },
    reason: "You were on the ReelSpy waiting list.",
  });

  return sendEmail({ to, subject: "Your ReelSpy access is open", html, text });
}

/** "Not this time" — sent when an admin declines the entry. */
export async function sendWaitlistRejection(params: {
  to: string;
  name?: string | null;
}): Promise<boolean> {
  const { to, name } = params;

  const blocks: EmailBlock[] = [
    {
      kind: "paragraph",
      text: "We're keeping the beta small while we make sure every account gets fast, reliable Instagram data and AI scripts from day one — and we're not able to offer you access with this batch.",
    },
    {
      kind: "paragraph",
      text: "This isn't permanent. If your situation changes, just reply to this email and we'll take another look.",
      muted: true,
    },
  ];

  const { html, text } = buildEmail({
    eyebrow: "Waiting list",
    preheader: "An update on your ReelSpy waiting-list application.",
    title: name?.trim() ? `${name.trim()}, an update on your application.` : "An update on your application.",
    blocks,
    reason: "You applied for the ReelSpy waiting list.",
  });

  return sendEmail({ to, subject: "An update on your ReelSpy waiting list application", html, text });
}
