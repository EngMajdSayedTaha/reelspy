# Email templates

Every email ReelSpy sends is built from ONE template — `lib/email/layout.ts` —
so a receipt, a dunning notice, a publish failure and the weekly digest all read
as the same product: the ReelSpy mark on the dark header band, the same type
scale, the same yellow call-to-action, the same footer with support and legal
links.

## How product emails are written

Emails are declared as **content**, never as markup. `buildEmail()` turns that
declaration into the table-based HTML that survives Outlook/Gmail **and** the
plain-text alternative, from the same object — so the two can't drift apart.

```ts
import { buildEmail } from "@/lib/email/layout";

const { html, text } = buildEmail({
  eyebrow: "Billing",                       // category, shown in the header band
  preheader: "Nothing changes today.",      // the grey line next to the subject
  title: "Your plan changes to Pro on Aug 29, 2026",
  blocks: [
    { kind: "paragraph", text: "Your upgrade is booked." },
    { kind: "rows", caption: "What was scheduled", rows: [
      { label: "Charged today", value: "Nothing", emphasis: true },
    ] },
    { kind: "bullets", caption: "What Pro gives you", items: [...] },
    { kind: "callout", tone: "success", text: "Nothing changes today." },
  ],
  cta: { href: "…/dashboard/billing", label: "View scheduled change" },
  secondary: { href: invoiceUrl, label: "View invoice" },
  footnote: "You can cancel this scheduled change any time.",
  reason: "You're receiving this because you have a paid ReelSpy subscription.",
  unsubscribeUrl,                            // optional; only for opt-in mail
});
```

Block kinds: `paragraph`, `heading`, `rows` (label/value table), `bullets`,
`callout` (`neutral | success | warn | danger`), `linkList` (the digest's reel
rows). All user-supplied strings are HTML-escaped by the renderer — never
concatenate raw HTML into a block.

Rules that hold across every email:

- **Logo**: `${NEXT_PUBLIC_SITE_URL}/brand/reelspy-logo-512.png`, an absolute
  public URL (mail clients can't resolve relative paths). Serve it from the app
  origin — `public/brand/` — and never move it without updating this.
- **Both parts, always.** Text-only clients and spam filters both care.
- **Dark mode**: handled by `prefers-color-scheme` overrides in the template.
- **Support**: `support@reelspy.dev` appears in every footer, plus Terms/Privacy.

### Where each email lives

| Email | Trigger | Module |
|---|---|---|
| Welcome / subscription active | first paid invoice | `lib/email/billing.ts` |
| Renewal receipt | `invoice.payment_succeeded` (cycle) | `lib/email/billing.ts` |
| Renewal reminder | `invoice.upcoming` | `lib/email/billing.ts` |
| Payment failed (dunning) | `invoice.payment_failed` | `lib/email/billing.ts` |
| Plan change scheduled | user schedules an upgrade/downgrade | `lib/email/billing.ts` |
| Plan change applied | schedule phase goes live at renewal | `lib/email/billing.ts` |
| Plan change cancelled | user keeps their current plan | `lib/email/billing.ts` |
| Cancellation scheduled | `cancel_at_period_end` → true | `lib/email/billing.ts` |
| Subscription resumed | `cancel_at_period_end` → false | `lib/email/billing.ts` |
| Subscription ended | `customer.subscription.deleted` | `lib/email/billing.ts` |
| Refund issued | `charge.refunded` | `lib/email/billing.ts` |
| Dispute alert (internal) | `charge.dispute.created` | `lib/email/billing.ts` |
| Publish failure | ≥1 failed publish target | `lib/email/publish-failure.ts` |
| Weekly digest | weekly cron (opt-in) | `lib/email/weekly-digest.ts` |
| IG cookie health (internal) | daily watchdog failure | `app/api/cron/ig-cookie-health/route.ts` |

All of them are **fail-open**: with `RESEND_API_KEY` / `EMAIL_FROM` unset,
`sendEmail` logs and returns `false`. A missing notification never fails a
billing state change or a publish.

## Supabase auth emails

Signup confirmation and password reset are sent by **Supabase**, not by this
codebase, so they can't use `buildEmail()` — they have to be pasted into
**Supabase → Authentication → Emails → Templates**. The markup below is the same
design, flattened to static HTML.

> **Keep the link URLs exactly as written.** They use `token_hash` +
> a server-side `verifyOtp()` (`app/auth/confirm/route.ts`), *not* Supabase's
> default PKCE `{{ .ConfirmationURL }}` — PKCE plants a code-verifier cookie in
> the browser that requested the email, so opening it on a phone fails. See
> `docs/domain-migration.md` §6.

### Confirm signup — the 6-digit code

**Signup is a code flow, not a link flow.** `/signup` creates the account and
then asks for the 6 digits from this email
(`components/auth/EmailOtpStep.tsx` → `verifyOtp({ email, token, type:
"signup" })`). The whole thing happens in the tab they already have open, so
nobody has to leave the browser, find the mail app, and come back — and it
works when the mail is read on a different device from the one signing up.

> **`{{ .Token }}` is what makes this work.** It renders the 6-digit code.
> Remove it from this template and the signup screen asks for a code that was
> never sent. The link stays in as a fallback for whoever clicks by reflex —
> both carry the same token, so either one confirms the account.

Also set **Authentication → Sign In / Providers → Email → Email OTP
Expiration** to `3600` (one hour) or less. It governs this code *and* the link
below; longer is flagged by Supabase's own security advisor because it widens
the window for guessing a 6-digit code.

Subject: `Your ReelSpy verification code`

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
      <tr><td style="background:#121212;padding:20px 32px">
        <a href="https://app.reelspy.dev" style="text-decoration:none">
          <img src="https://app.reelspy.dev/brand/reelspy-logo-512.png" width="36" height="36" alt="ReelSpy" style="display:inline-block;vertical-align:middle;border-radius:9px;border:0">
          <span style="display:inline-block;vertical-align:middle;padding-left:10px;font-size:17px;font-weight:700;letter-spacing:-0.2px;color:#FFFFFF">ReelSpy</span>
        </a>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:#0F172A">Your verification code</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569">
          Welcome to ReelSpy. Enter this code on the signup screen and your account is ready — you can start tracking accounts and turning their best reels into scripts straight away.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px 12px">
            <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;line-height:1;color:#0F172A">{{ .Token }}</div>
          </td>
        </tr></table>
        <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#475569">
          Not on the signup screen anymore? <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup" style="color:#475569;text-decoration:underline">Confirm with this link instead</a> — it works on any device.
        </p>
        <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#94A3B8">
          The code expires shortly for your security, and can only be used once. If you didn't create a ReelSpy account, you can ignore this email — nobody can use this code without it.
        </p>
      </td></tr>
      <tr><td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:22px 32px">
        <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#475569">
          Need help? Write to <a href="mailto:support@reelspy.dev" style="color:#475569;text-decoration:underline">support@reelspy.dev</a> — a human answers.
        </p>
        <p style="margin:0;font-size:11px;line-height:1.7;color:#94A3B8">
          You're receiving this because someone signed up for ReelSpy with this address.<br>
          &copy; ReelSpy · Dubai, United Arab Emirates
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

<details>
<summary>The previous link-only version of this template</summary>

Kept for reference. Pasting this back means `{{ .Token }}` is gone, so the
signup screen's code entry has nothing to accept — only revert it alongside
reverting `/signup`.

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
      <tr><td style="background:#121212;padding:20px 32px">
        <a href="https://app.reelspy.dev" style="text-decoration:none">
          <img src="https://app.reelspy.dev/brand/reelspy-logo-512.png" width="36" height="36" alt="ReelSpy" style="display:inline-block;vertical-align:middle;border-radius:9px;border:0">
          <span style="display:inline-block;vertical-align:middle;padding-left:10px;font-size:17px;font-weight:700;letter-spacing:-0.2px;color:#FFFFFF">ReelSpy</span>
        </a>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:#0F172A">Confirm your email</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569">
          Welcome to ReelSpy. Confirm this address and your account is ready — you can start tracking accounts and turning their best reels into scripts straight away.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0"><tr>
          <td align="center" style="background:#F9E400;border-radius:10px;mso-padding-alt:14px 28px">
            <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;line-height:1;color:#121212;text-decoration:none;border-radius:10px">Confirm my email</a>
          </td>
        </tr></table>
        <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#94A3B8">
          This link works on any device and expires shortly for your security. If you didn't create a ReelSpy account, you can ignore this email.
        </p>
      </td></tr>
      <tr><td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:22px 32px">
        <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#475569">
          Need help? Write to <a href="mailto:support@reelspy.dev" style="color:#475569;text-decoration:underline">support@reelspy.dev</a> — a human answers.
        </p>
        <p style="margin:0;font-size:11px;line-height:1.7;color:#94A3B8">
          You're receiving this because someone signed up for ReelSpy with this address.<br>
          &copy; ReelSpy · Dubai, United Arab Emirates
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

</details>

### Reset password

Subject: `Reset your ReelSpy password`

Password reset stays a **link** flow — the person has to land on
`/reset-password` to type a new password anyway, so a code would just add a
step. Same markup as the archived link template above with these swaps:

- Heading → `Reset your password`
- Paragraph → `We received a request to set a new password for your ReelSpy account. Choose a new one below — your current password stays active until you do.`
- Link href → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`, button label `Choose a new password`
- Footnote → `This link works on any device and expires shortly. If you didn't request a reset, you can ignore this email — your password won't change.`

### Email change / magic link

Not used by the app today. If either is switched on, copy the same shell and set
the href to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`
(or `type=magiclink`).

## Checking delivery

```
npm run check:email you@example.com
```

Sends through the configured Resend key and reports what the provider said —
more reliable than trusting the Supabase dashboard's "saved" toast.
