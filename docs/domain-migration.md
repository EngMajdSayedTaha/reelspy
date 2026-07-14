# reelspy.dev domain migration — founder actions only

> **All code is done.** Everything below is external/dashboard configuration that
> only the account owner can do (DNS, third-party consoles, API keys). Do these
> **in order** — several steps depend on the one before it. The code already
> supports both the old and new domain simultaneously, so nothing breaks
> mid-migration; each step just unlocks/cuts over one more thing.

---

## 1. Vercel — add the domain

1. Vercel → Project → **Settings → Domains** → Add `reelspy.dev`.
2. Add `www.reelspy.dev` too, redirecting to the apex (Vercel offers this
   automatically when you add both).
3. Add the DNS records Vercel shows you at your domain registrar (an `A`/`ALIAS`
   record for the apex + a `CNAME` for `www`, or nameserver delegation if you
   used Vercel's own DNS).
4. Once verified, set `reelspy.dev` as the **production domain** for the project.
5. Go back to **Settings → Domains**, find `reelspy-one.vercel.app`, and set it
   to **"Redirect to reelspy.dev"** (308). Vercel does **not** do this
   automatically when you add a new production domain — you have to flip it by
   hand. This is what sends old bookmarks/links to the domain whose cookies
   actually count (the app's session cookies are scoped to whichever host the
   request came in on).

## 2. Vercel — environment variables

Project → **Settings → Environment Variables** (Production):

- `NEXT_PUBLIC_SITE_URL=https://reelspy.dev`

Later, once Resend is set up (step 4):

- `RESEND_API_KEY=<from Resend>`
- `EMAIL_FROM=ReelSpy <notify@reelspy.dev>`

Setting these un-no-ops the weekly digest and publish-failure emails
(`lib/email/send.ts` fails open until both are set).

Redeploy after changing env vars (Vercel doesn't hot-reload them into a
running deployment).

## 3. GitHub — repo variable for cron workflows

Repo → **Settings → Secrets and variables → Actions → Variables**:

- `APP_BASE_URL=https://reelspy.dev`

Used by the 5 cron workflows under `.github/workflows/` that call
`/api/cron/*` routes with `CRON_SECRET`.

## 4. Resend — verify the sending domain

1. Resend → **Domains** → Add `reelspy.dev`.
2. Add the DKIM + SPF DNS records Resend shows you at your registrar.
3. Wait for verification (usually minutes, can take longer depending on your
   registrar's propagation).
4. Recommended: add a DMARC TXT record too — `v=DMARC1; p=none;` at
   `_dmarc.reelspy.dev` is a safe starting policy (monitor-only, doesn't reject
   anything, but signals you're paying attention).
5. Go back to step 2 above and set `RESEND_API_KEY` + `EMAIL_FROM` in Vercel.

## 5. Supabase — custom SMTP (Resend)

**Auth → Settings → SMTP Settings** (or **Auth → Emails → SMTP** depending on
dashboard version):

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender email | `auth@reelspy.dev` |
| Sender name | `ReelSpy` |

This replaces Supabase's shared/unbranded SMTP (rate-limited to ~2 emails/hour
and sent from a generic address) with Resend, sending from your own verified
domain. While you're in there, raise the auth email rate limits — the shared
SMTP default is far too low for real signup volume.

## 6. Supabase — branded email templates

**Auth → Templates.** The architecture decision here matters: these links use
`token_hash` + a server-side `verifyOtp()` call (`app/auth/confirm/route.ts`),
**not** Supabase's default PKCE `{{ .ConfirmationURL }}`. PKCE plants a
code-verifier cookie in the browser that *requested* the email; if the user
opens the email on their phone instead, the verifier is missing and the link
fails. `token_hash` verification works in any browser because the session gets
set server-side.

**This means you must edit the link URL in each template — do not use the
default `{{ .ConfirmationURL }}`.**

### Confirm signup

Set the link href to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
```

Suggested body (adjust styling to taste — keep the link URL exactly as above):

```html
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0F172A;color:#E2E8F0;padding:40px 20px">
  <div style="max-width:420px;margin:0 auto;text-align:center">
    <h1 style="font-size:20px;margin:0 0 8px;color:#fff">Confirm your email</h1>
    <p style="font-size:14px;color:#94A3B8;margin:0 0 24px">
      Welcome to ReelSpy. Click below to activate your account.
    </p>
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup"
       style="display:inline-block;background:#F9E400;color:#121212;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
      Confirm email
    </a>
    <p style="font-size:12px;color:#64748B;margin:24px 0 0">
      If you didn't create a ReelSpy account, you can ignore this email.
    </p>
  </div>
</div>
```

### Reset password

Set the link href to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

Suggested body:

```html
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0F172A;color:#E2E8F0;padding:40px 20px">
  <div style="max-width:420px;margin:0 auto;text-align:center">
    <h1 style="font-size:20px;margin:0 0 8px;color:#fff">Reset your password</h1>
    <p style="font-size:14px;color:#94A3B8;margin:0 0 24px">
      Click below to choose a new password. This link works on any device and
      expires shortly for your security.
    </p>
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password"
       style="display:inline-block;background:#F9E400;color:#121212;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
      Reset password
    </a>
    <p style="font-size:12px;color:#64748B;margin:24px 0 0">
      If you didn't request this, you can ignore this email — your password
      won't change.
    </p>
  </div>
</div>
```

## 7. Supabase — URL configuration

**Auth → URL Configuration:**

- **Site URL**: `https://reelspy.dev`
- **Redirect URLs** (allow-list), one per line:
  - `https://reelspy.dev/**`
  - `http://localhost:3000/**`
  - `https://reelspy-one.vercel.app/**` (keep temporarily during transition,
    remove once cutover is confirmed stable)

## 8. Supabase — enable "Confirm email" (do this LAST)

**Auth → Providers → Email → Confirm email → ON.**

Enable this **only after step 5 (custom SMTP) is live and verified**. The
shared Supabase SMTP is rate-limited to ~2 emails/hour — turning on required
confirmation before custom SMTP is wired up will silently break signups for
everyone after the first couple of users each hour. The app code already
handles both states (`app/signup/page.tsx` checks `data.session` — if
confirmation is off, signup returns a live session immediately; if it's on,
it shows the "check your email" state), so shipping the code ahead of this
flag is safe.

## 9. OAuth consoles

### Google Cloud Console

- The OAuth **redirect URI** stays the Supabase-hosted callback URL —
  unchanged, do not touch it.
- Add `https://reelspy.dev` to **Authorized JavaScript origins**.
- Update the OAuth consent screen's homepage, privacy policy, and terms of
  service links to point at `reelspy.dev`.

### Meta (Instagram/Facebook)

- Update the app's OAuth redirect URI to `https://reelspy.dev/api/ig/callback`
  and set `META_REDIRECT_URI` in Vercel to match.
- Update the webhook callback URL to `https://reelspy.dev/api/ig/webhooks`.

### TikTok

- Update the redirect URI in the TikTok developer portal + set
  `TIKTOK_REDIRECT_URI` in Vercel to match.

### YouTube (Google Cloud, separate OAuth client)

- Update the redirect URI + set `YOUTUBE_REDIRECT_URI` in Vercel to match.

## 10. Stripe

1. Create a **new** webhook endpoint: `https://reelspy.dev/api/stripe/webhook`,
   subscribed to `checkout.session.completed` and
   `customer.subscription.created/updated/deleted` (same events as the old
   one).
2. Copy the new endpoint's signing secret into Vercel as
   `STRIPE_WEBHOOK_SECRET`.
3. After confirming checkout/webhook work end-to-end on the new domain, delete
   the old `reelspy-one.vercel.app` webhook endpoint in Stripe.

## 11. Cloudflare R2 — CORS

R2 bucket → **Settings → CORS Policy** → add `https://reelspy.dev` to
`AllowedOrigins` (keep the old origin during transition, remove once cutover
is stable).

## 12. Inbound mail for support@ / privacy@reelspy.dev

Resend is **send-only** — it doesn't receive mail. Pick one:

- **Cloudflare Email Routing** (free, if `reelspy.dev`'s DNS is on
  Cloudflare) → forward `support@reelspy.dev` and `privacy@reelspy.dev` to
  `majd.sayed.taha@gmail.com`.
- **ImprovMX** (free tier, works with any DNS provider) → same forwarding
  setup via an MX + TXT record.

---

## Post-cutover smoke test

Run through this on `https://reelspy.dev` before considering the migration
done:

- [ ] `https://reelspy-one.vercel.app` redirects (308) to `https://reelspy.dev`
- [ ] `/robots.txt` and `/sitemap.xml` serve and reference `reelspy.dev`
- [ ] View page source on `/` — OG tags and canonical URL point at
      `reelspy.dev`
- [ ] Sign up with a real email → confirmation email arrives from
      `auth@reelspy.dev` (not Supabase's shared sender) → link lands on
      `/auth/confirm` → `/dashboard`
- [ ] Request a password reset → email arrives → open the link **on a
      different device/browser than the one that requested it** → lands on
      `/reset-password` with a working session (this is the specific bug the
      token_hash approach fixes — confirm it actually works)
- [ ] Reused/expired reset link → `/forgot-password?error=link_expired`
- [ ] Visit `/reset-password` directly while signed out → redirected to
      `/forgot-password?error=link_expired`
- [ ] Google sign-in works end-to-end on `reelspy.dev`
- [ ] Stripe test-mode checkout completes and the webhook fires (check Stripe
      Dashboard → Webhooks → recent deliveries)
- [ ] `node scripts/check-auth-setup.mjs` passes with `NEXT_PUBLIC_SITE_URL`
      set
- [ ] Run a deliverability check (e.g. [mail-tester.com](https://www.mail-tester.com))
      against a signup or reset email — fix any SPF/DKIM/DMARC gaps before
      relying on it for real users
- [ ] Only after all of the above: flip **Confirm email** on in Supabase
      (step 8) and do one more real signup to confirm the fully-live flow
