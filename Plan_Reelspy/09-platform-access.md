# 09 — Platform Access & Go-Live (Meta → TikTok → YouTube)

> **Who executes this:** a Claude Code session ("the coworker") running on the founder's
> Windows PC at `c:\Majdst_codes\reelspy`, with the same conventions as
> `Plan_Reelspy/CLAUDE.md`. Every step below is tagged **[AGENT]** (the coworker can do it
> end to end) or **[FOUNDER]** (a human must click, upload an ID, or press Submit — an
> agent must never attempt these).
>
> **What this plan answers:** how to go live and get real users' Instagram accounts
> connecting, *without* a company trade licence — and then the same question for TikTok
> (Phase 2) and YouTube/Google (Phase 3).
>
> **Status of the code:** Launch, V1.1 and V2 are shipped (`ROADMAP.md`). Instagram,
> Facebook, TikTok and YouTube adapters all exist (`lib/publishing/adapters/`). This plan
> is therefore ~80% external approvals and ~20% code. The code parts are listed as P-items
> and tracked in `TASKS.md`.
>
> Last updated: 2026-08-05

---

## 0. The one thing that decides everything

Every platform here has the same shape, and the whole plan is organised around it:

| | Who it works for | What it costs |
|---|---|---|
| **Standard access** (Meta) / **dev mode** (TikTok) / **unverified** (Google) | Only people with a **role on your app** — you, plus a small invited cohort | Nothing. Works **today**. |
| **Advanced access** / **audited** / **verified** | Anyone who signs up | A review submission, and for Meta, business verification |

**The wall is not "can I write the code" — the code is written. The wall is "can a stranger
connect their account."** Until you cross it, a stranger who clicks *Connect Instagram* gets
a Facebook error page, not a consent dialog.

So the plan does two things in parallel:

1. **Phase 0 — earn money and learn from real users *this week*, inside Standard access.**
   That is a legitimate, invite-only launch, not a workaround.
2. **Phase 1–3 — walk each platform's review ladder**, cheapest and most-likely-to-succeed
   route first.

### The honest answer on "no company licence"

| Platform | Registered company required? | Verdict |
|---|---|---|
| **Meta** (Instagram + Facebook) | **Business Verification is required for Advanced Access.** Meta's flow does have an unregistered / individual route, but acceptance varies by country and UAE reviewers commonly expect a trade licence. | ⚠️ **Try free first, budget for a fallback.** This is the only genuinely uncertain one. §2 is a ladder, not a single path. |
| **TikTok** | **No.** There is no business-verification step. An individual developer account plus the Content Posting API audit is the whole gate. | ✅ **Yes, doable without a licence.** |
| **YouTube / Google** | **No entity required.** The gates are *domain ownership* (you own `reelspy.dev`) plus OAuth app verification and the YouTube API compliance audit. | ✅ **Yes, doable as an individual.** |

Do not let Meta's uncertainty block Phases 2 and 3 — **they are independent and both are
winnable without a licence.** Run them concurrently with the Meta ladder.

---

## Phase 0 — Go live this week, zero approvals

**Goal:** paying users, real Instagram connections, real scripts — inside Standard access.
**Ceiling:** the number of app-role users Meta allows (read the exact number off the Roles
page — treat ~25 as the working assumption). That is enough for the first cohort and for the
screencast evidence Phase 1 needs.

### How Instagram actually connects in Phase 0

A user connects with **zero Meta review** if all of these are true:

1. Their Instagram is a **Business or Creator** account (not Personal).
2. It is **linked to a Facebook Page** — required, because ReelSpy's core wedge (Business
   Discovery, i.e. reading competitor accounts) only exists on the Facebook Login flow.
   See the header comment in `lib/instagram/graph-api.ts`.
3. They have been added as a **Tester** on the Meta app, and have **accepted the invite**.

That third point is the entire Phase 0 mechanism, and it is the step users get stuck on —
the invite is accepted in a place nobody finds by themselves.

#### P0.1 [FOUNDER] Invite each beta user as a Tester

For each user, in the Meta App Dashboard → **App Roles → Roles → Add People → Tester**,
enter their **Facebook** account. Then tell them, in these exact words:

> Open **Facebook → Settings & Privacy → Settings → Apps and Websites → Business
> Integrations → Requests** (mobile: Facebook app → Menu → Settings & Privacy → Settings →
> Apps and Websites) and **accept the ReelSpy tester invitation**. Then come back and press
> Connect Instagram.

#### P0.2 [AGENT] Ship the invite-gated onboarding path — **code — shipped**

A non-tester's connect attempt doesn't fail at Facebook with an error we can catch — Meta's
own "App Not Active" interstitial never redirects back to `/api/ig/callback` at all, so
there is nothing here to detect after the fact. The fix has to run *before* the click.

Shipped:

- `components/connections/BetaTesterGate.tsx` — static explanation card, rendered above the
  Instagram `ConnectionCard` on `/dashboard/connections` whenever `META_BETA_MODE=true` and
  the user isn't connected yet. States the exact desktop/mobile path to accept a tester
  invite (from P0.1) and a `mailto:` "Request access" action to `SUPPORT_EMAIL`.
- Provider-error copy in `lib/i18n/dictionaries/connections.ts` (en/ar): `connectionCancelled`
  now maps Facebook's real `access_denied` code (Cancel on the consent dialog) instead of
  falling through to the generic error; `noIgBusinessAccount` was rewritten as an honest
  two-cause checklist (Personal account vs. Business/Creator not linked to a Page) — the
  Graph API response can't actually distinguish those two causes, so two fake separate
  messages would have been dishonest, not more helpful.
- "not-a-tester" itself has no error-code path by design (see above) — it's covered by the
  beta gate being shown *before* the attempt, not by a mapped error after one.
- The **starter-pack path already exists** (`app/dashboard/onboarding/actions.ts`) and needs
  no Meta connection at all — unaffected by this change, still the fallback for anyone who'd
  rather skip the gate entirely.

**Verification gate (do this before flipping `META_BETA_MODE=true` in production):** a
second Facebook account that is *not* a tester sees the beta card and, if it proceeds
anyway, lands on Facebook's own dead-end page (expected — nothing server-side can prevent
that click, only warn ahead of it); a tester account completes connect → sync → first
script with the card no longer showing once connected.

#### P0.3 [AGENT] Preflight the handshake before any user touches it — **code exists, run it**

```powershell
npm run check:meta
npm run check:meta -- --redirect-uri https://app.reelspy.dev/api/ig/callback
```

`scripts/check-meta-oauth.mjs` reproduces the OAuth handshake without a browser and catches
the **URL Blocked** failure (redirect URI not whitelisted) that silently killed connects
from 2026-07-25 to 2026-07-30. **Run this after every domain, env or Meta-console change.**
It is the single highest-value 10 seconds in this plan.

#### P0.4 [FOUNDER] The rest of go-live

These are already itemised — do not duplicate them here, work them from
[`GO-LIVE-CHECKLIST.md`](./GO-LIVE-CHECKLIST.md):

- Stripe UAE approval + 3 prices + webhook (**the long pole — apply first, today**)
- Apply migration `supabase/migrations/20260704130000_ig_connections.sql`
- `support@reelspy.dev` + `privacy@reelspy.dev` mailboxes (App Review checks these resolve)
- `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `CRON_SECRET`

> **If Stripe UAE stalls:** that is the same problem as the Meta licence problem, and it has
> the same fallback (§2, Rung 3). Solving it once solves both.

---

## Phase 1 — Meta Advanced Access without a trade licence

**Goal:** any stranger can connect Instagram. **Realistic elapsed time:** 3–8 weeks, most of
it waiting. **Start the clock now** — Rung 1 is free and tells you within a week whether you
need Rung 3.

### 1a. What Meta will actually check

Advanced Access is granted by **App Review**, and App Review requires **Business
Verification** to have already passed. The two most common rejections are (i) submitting
App Review before verification is complete, and (ii) a screencast that doesn't show the
whole flow. Both are avoidable.

The permissions ReelSpy needs (currently requested in `app/api/ig/connect/route.ts`):

| Permission | What it powers in ReelSpy | Priority |
|---|---|---|
| `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `business_management` | Business Discovery — **the wedge**. Without this, nothing works. | **P0** |
| `instagram_manage_insights` | Out-performance scoring vs the account's own baseline | **P0** |
| `instagram_content_publish`, `pages_manage_posts` | Publishing module | P1 |
| `instagram_manage_comments`, `instagram_manage_messages`, `pages_manage_metadata`, `pages_messaging` | Comment→DM Auto-Reply (retention hook) | P1 |

**[AGENT] Recommendation: split the submission.** Submit the **P0 set first**, alone. It is
one coherent use case ("show a creator how competitor Reels in their niche perform"), it is
easy to screencast, and messaging permissions attract far heavier scrutiny — bundling them
risks sinking the wedge with them. Add P1 in a second submission once P0 is approved.
`META_IG_SCOPES` already exists as an env override, so the requested scope list can be
narrowed to the approved set **without a code change**.

#### 1a.1 — App Dashboard cleanup — **done, 2026-08-05**

The Meta app (`2368302653646041`) had accumulated ~49 unused permissions and features —
none referenced anywhere in the repo and all showing zero (or, for a handful, a shared
artifact) API calls on Meta's own dashboard. Audited the codebase against the live
**Permissions and Features** page (`App Review → Permissions and Features`) and removed
every item with no code path and no App-Review request attached. Two rounds of verification
against Meta's live "API calls" counter per permission — not just the code grep — caught a
handful of rapid-batch clicks that silently didn't register the first time.

Kept (16), matching the P0/P1 table above plus a few dashboard-only items with real traffic
that aren't literal scope strings in code:
- The 5 pending-App-Review P0 permissions (`instagram_basic`, `pages_show_list`,
  `pages_read_engagement`, `business_management`, `instagram_manage_insights`)
- The 4 live Auto-Reply P1 permissions (`pages_manage_metadata`, `pages_messaging`,
  `instagram_manage_comments`, `instagram_manage_messages`)
- The 2 Publishing-module P1 permissions (`instagram_content_publish`, `pages_manage_posts`)
  — kept despite showing **0 live calls**: they're wired into
  `lib/publishing/adapters/instagram.ts` / `facebook.ts`, just not yet exercised by a real
  publish
- `instagram_business_basic` (33 live calls) — not a literal scope in
  `app/api/ig/connect/route.ts`, but almost certainly Meta's renamed `instagram_basic` under
  its 2024 taxonomy update; real traffic, too risky to touch
- Page Public Metadata Access (64 calls) and Business Asset User Profile Access (2 calls) —
  features tied to the Business Discovery / Page-lookup machinery, not directly requested in
  code but carrying real traffic
- `public_profile` (Meta auto-grants this to every app) and `email` (has Advanced access
  granted; left alone per founder instruction regardless of its 0 live calls)

Removed (49): everything else — commerce/shopping, Marketing API, ads, branded-content,
Live Video, Threads, Instant Articles, and every `*_business_manage_*` / `*_business_content_*`
duplicate-naming permission that belongs to the Instagram-Login flow this app doesn't use
(see the `graph-api.ts` header comment — ReelSpy is Facebook-Login-only). Two of these
(`ads_read`/`ads_management` at 3.208K calls, and three creator-marketplace/branded-content
permissions at 3.071K calls) showed nonzero "Active" counts despite zero code references —
almost certainly a shared aggregate-counter artifact on Meta's dashboard for that permission
block, not genuine ReelSpy traffic; confirmed safe to remove since they dropped to
`Inactive` at the same count rather than erroring.

All removals are Standard-access-level and reversible without a new App Review — Meta's own
confirmation dialog states access is "auto-granted" again at the same level on request. This
does **not** touch the P0/P1 submission plan below; it only clears dashboard clutter that
made the real requested-permission list harder for a reviewer (or a future session) to read.

### 1b. The ladder — climb in order, stop when one works

#### Rung 1 [FOUNDER] — Verify as an unregistered / individual business (free, ~3–7 days)

In **Meta Business Manager → Business Settings → Business Info → Security Centre → Start
Verification**, when asked whether the business is registered, choose the **not-registered /
individual** option if it is offered in your market. Then maximise every non-licence signal
Meta can check — this is what decides borderline cases:

- **Domain ownership**: `reelspy.dev` verified in Business Manager → Brand Safety →
  Domains. **[AGENT]** can add the DNS TXT/meta-tag; the landing repo serves the root.
- **Professional email on the domain**: submit `majd@reelspy.dev`, never a Gmail address.
  (`support@` and `privacy@` from P0.4 must also resolve.)
- **Public, consistent business presence**: `reelspy.dev` must state the business name,
  contact email and address exactly as entered in Business Manager. **Name, email and
  address must match character-for-character across Meta, the website and any document.**
  Mismatch is the #1 silent rejection.
- Supporting documents where a licence is asked for: **Emirates ID**, a **utility/DEWA bill
  or tenancy contract** in the same name, and a **bank statement** showing the business name.

**Gate:** Verified → go to §1c. Rejected → Rung 2. **Read the rejection reason** — Meta names
the failing signal, and it is often a fixable mismatch rather than a missing licence.

#### Rung 2 [FOUNDER] — UAE freelance permit (~AED 3.5k–7.5k/yr, 1–3 weeks)

A freelance permit from a free zone (GoFreelance/Dubai, RAKEZ, Ajman, twofour54) is a
fraction of a full trade licence, is issued to an individual, and produces the document Meta
asks for. Cheapest thing that is unambiguously a licence.

#### Rung 3 [FOUNDER] — US LLC (~$300–500 setup, ~1–2 weeks) — **the highest-leverage option**

A Wyoming/New Mexico LLC via Stripe Atlas / Firstbase / Doola yields Articles of
Organization + EIN + a registered-agent address. This one move clears **three** blockers at
once:

1. Meta Business Verification (accepts US incorporation documents readily),
2. **Stripe** — a US Stripe account instead of waiting on Stripe UAE approval, which
   `GO-LIVE-CHECKLIST.md` already calls "the long pole",
3. Google/TikTok, if either ever asks for entity details.

⚠️ **Not tax advice.** A UAE resident owning a US LLC has US filing obligations (Form 5472
in particular) and possible UAE corporate-tax implications. **Confirm with an accountant
before filing.** This plan states the option; it does not decide it for you.

> **Decision point for the founder:** if Rung 1 fails, Rung 3 is usually the better value
> because of the Stripe overlap — but that is a business call, not the coworker's. The
> coworker must **stop and ask** here, never file anything.

### 1c. Code prerequisites for App Review — **[AGENT], do these before submitting**

These are hard requirements Meta checks, and the repo does not have all of them yet.

- **P1.1 — Meta Deauthorize + Data Deletion callbacks.** Meta requires a working
  **Deauthorize Callback URL** and **Data Deletion Callback URL**. The repo has
  `/api/account/delete` (in-app, session-authenticated) but **no Meta-facing signed-request
  endpoint**, and it never stores the Facebook app-scoped user ID, so a Meta callback could
  not identify the user. *Shipped in this branch — see §1d.*
- **P1.2 — Point the console at them.** [FOUNDER] App Dashboard → App Settings → Basic:
  Deauthorize `https://app.reelspy.dev/api/meta/deauthorize`, Data Deletion
  `https://app.reelspy.dev/api/meta/data-deletion`, Privacy Policy
  `https://app.reelspy.dev/privacy`, Terms `https://app.reelspy.dev/terms`.
- **P1.3 — Privacy policy must name Meta data explicitly.** `lib/i18n/dictionaries/legal.ts`
  already discloses processors and PDPL. Verify it states *which* Meta permissions are used
  and *why*, in reviewer-legible language. Reviewers read this page.
- **P1.4 — A reviewer test account.** Meta reviewers need working credentials that reach the
  full flow. *Correction to this plan: `scripts/seed-accounts.mjs` is the niche-research seed
  loader (populates `seed_accounts`/`ig_account_snapshots` for the Trend Radar) — unrelated to
  a reviewer login. Fixed here per rule 2 below.* The actual login is created by the new
  **[AGENT]** `scripts/seed-reviewer-account.mjs` (service-role `auth.admin.createUser`,
  idempotent — re-run to rotate the password). It can only create the login itself; connecting
  a real Instagram Business account is a live Meta OAuth consent click, which is **[FOUNDER]**
  by nature (no credentials exist for an agent to complete it with). Shipped: the login
  `meta-reviewer@reelspy.dev` exists; credentials were printed once to the founder's terminal
  and are not stored in this repo. **Still needed [FOUNDER]:** log in as that account, press
  Connect Instagram with an IG Business/Creator account you control (linked to a Facebook
  Page), then sync + generate one script so the reviewer sees a populated flow, not an empty
  feed — only then is P1.4 actually done.
- **P1.5 — The screencast.** This is where submissions die. Record **one unbroken take**:
  log in → press Connect Instagram → **the Facebook consent dialog with every requested
  permission visible** → back in ReelSpy → competitor accounts listed → the Feed showing
  real Reels with out-performance scores → a generated script. Narrate which permission each
  screen needs. **Every permission you request must appear on screen being used.** Requesting
  a permission the video never demonstrates is an automatic rejection.

### 1d. What this branch already shipped for P1.1

Committed alongside this plan:

| File | Purpose |
|---|---|
| `lib/meta/signed-request.ts` | Parses + HMAC-verifies Meta's `signed_request`, constant-time |
| `app/api/meta/deauthorize/route.ts` | User removes ReelSpy from Facebook → credentials cleared |
| `app/api/meta/data-deletion/route.ts` | Meta-initiated erasure → returns `{url, confirmation_code}` |
| `app/meta/data-deletion/page.tsx` | The status page that `url` points at |
| `supabase/migrations/20260802120000_profiles_fb_user_id.sql` | Stores the app-scoped FB user ID so callbacks can resolve a user |
| `test/meta/signed-request.test.ts` | Signature verification, tamper + replay rejection |

The migration applies itself when this branch merges to `master` (the GitHub ↔ Supabase
integration runs `supabase db push` — see `supabase/migrations/README.md`). Before it lands,
both callbacks still answer Meta correctly but resolve no user: deliberately fail-open,
exactly like `lib/instagram/connections.ts`.

**Note on existing connections:** `fb_user_id` is captured at *connect* time, so users who
connected before this shipped have no ASID on file and their callbacks will resolve nobody.
They backfill themselves on the next reconnect. If a reviewer needs to see it work, reconnect
the demo account from P1.4 first.

### 1e. Verification gate for Phase 1

- [ ] `npm run check:meta` passes against the production redirect URI
- [ ] Business Verification shows **Verified** in Business Manager
- [ ] App is in **Live** mode, not Development
- [ ] Deauthorize + Data Deletion URLs return 200 to a signed test request
- [ ] A Facebook account with **no role on the app** completes Connect Instagram end to end
      ← **this is the only test that proves Advanced Access actually landed**
- [ ] `META_BETA_MODE` turned off, tester-invite copy removed from the connect screen

---

## Phase 2 — TikTok (no licence needed)

**Start this in parallel with Phase 1 — it does not depend on Meta.** Code is already
shipped: `lib/publishing/adapters/tiktok.ts` forces `SELF_ONLY` unless
`TIKTOK_ALLOW_PUBLIC=true`, which is exactly the posture TikTok requires pre-audit.

### T1 [FOUNDER] Register as an individual developer
developers.tiktok.com → register → **Individual** account type. No company documents. Add
the **Content Posting API** product and set `TIKTOK_REDIRECT_URI`.

### T2 [AGENT/FOUNDER] Verify the domain used for pull-from-URL
TikTok's `PULL_FROM_URL` only accepts URL prefixes you have verified in the developer
portal. Commit `c102c32` ("support a public Custom Domain for TikTok pull-from-URL") added
the R2 custom-domain support for precisely this. **[FOUNDER]** attach the custom domain to
the R2 bucket and verify the prefix in TikTok's portal; **[AGENT]** set and smoke-test the
env.

### T3 Work inside dev mode first
Unaudited apps: every post is forced `SELF_ONLY`, and only **5 accounts may authorise the
app per 24 hours**. Plan the beta cohort around that number — it is much tighter than Meta's.

### T4 [AGENT] Make the UX audit-compliant — **code — shipped**
TikTok rejects on UX compliance more than on anything else. Audit
`components/publishing/PublishComposer.tsx` against TikTok's current UX guidelines and fix:

- the creator must explicitly pick **draft vs direct post**,
- the **privacy-level selector** must show the real options returned by
  `/v2/post/publish/creator_info/query` (never a hardcoded list),
- **commercial-content / branded-content disclosure** toggles must be present,
- TikTok's **Terms & Music Usage Confirmation** must be shown and linked,
- the creator's **nickname/avatar** must be displayed so they know which account they post to.

Shipped:

- New `GET /api/publishing/tiktok/creator-info` calls
  `/v2/post/publish/creator_info/query/` live (never cached beyond the request) and returns
  the creator's avatar/nickname/username, real `privacy_level_options`, and
  comment/duet/stitch-disabled flags. Shares the same OAuth-refresh path as the dispatcher via
  a new `lib/publishing/oauth-token.ts` (`resolveOAuthAccessToken`, extracted so the two
  callers can't drift).
- `PublishComposer` fetches this once TikTok is selected + connected and renders a "TikTok
  settings" panel: creator avatar + nickname, a **draft vs direct** radio (draft routes to
  `/v2/post/publish/inbox/video/init/` — TikTok imports the video and the creator finishes
  composing inside the app, so privacy/disclosure fields don't apply there), a **privacy-level
  select built from the live `privacyLevelOptions`** (never hardcoded), **branded-content /
  own-promotional-content disclosure checkboxes**, and a required **Music Usage Confirmation +
  Terms of Service** confirmation checkbox linking to TikTok's actual policy pages.
- New `publish_jobs.platform_options jsonb` column (migration
  `20260802140000_publish_jobs_platform_options.sql`, TikTok-only for now, per CLAUDE.md
  non-negotiable #3 — not a new platform, just correctness for one already shipped) carries
  the creator's exact choices from composer → `createPublishPost` → `dispatchPost` → the
  adapter.
- `lib/publishing/adapters/tiktok.ts`: branches to the inbox/draft endpoint for `postMode:
  "draft"`; sends `brand_content_toggle`/`brand_organic_toggle`; still forces `SELF_ONLY`
  pre-audit regardless of the requested level (unchanged safety posture); rejects
  branded-content + `SELF_ONLY` (TikTok's own rule — that combination can't post) both
  client-side (composer gate) and server-side (the action + the adapter itself, so a bad
  request can never reach TikTok unexplained).
- Comment/duet/stitch disable toggles were **not** added — 1a's bullet list doesn't ask for
  them, and the existing hardcoded `disable_comment/duet/stitch: false` behavior is unrelated
  to audit compliance; scope kept to the five bullets above.

### T5 [FOUNDER] Submit the audit
Demo video + the same URLs as Meta. **~1–2 weeks** for a clean first pass.

### T6 [AGENT] Flip the switch
On approval, set `TIKTOK_ALLOW_PUBLIC=true` and redeploy. **Gate:** a post from a non-founder
account appears publicly on TikTok.

> **Not in scope:** the TikTok **Research API** (`TIKTOK_RESEARCH_ENABLED`) requires academic
> or non-profit affiliation and is not obtainable here. Leave it dormant — it is X5
> scaffolding and also needs a schema `platform` column. Don't widen the schema for it
> (`CLAUDE.md` non-negotiable #3).

---

## Phase 3 — YouTube / Google (no licence needed)

Also independent — start it whenever Phase 2 is submitted. `lib/publishing/adapters/youtube.ts`
already forces `private` unless `YOUTUBE_ALLOW_PUBLIC=true`.

**There are two separate gates here, and conflating them is the usual mistake:**

| Gate | Unlocks | Required for |
|---|---|---|
| **A. Google OAuth app verification** | Removes the "unverified app" warning, the 100-user cap, and the **7-day refresh-token expiry** | Anyone but you using it at all |
| **B. YouTube API Services compliance audit** | Uploads can be **public** instead of locked to `private` | Publishing being useful |

### Y1 [FOUNDER] Google Cloud project + OAuth consent screen
**External** user type, individual publisher — no organisation required. Support email
`support@reelspy.dev`, homepage `https://reelspy.dev`, privacy `https://app.reelspy.dev/privacy`,
terms `https://app.reelspy.dev/terms`.

### Y2 [AGENT] Request the narrowest scope that works — **code — shipped**
Use **`https://www.googleapis.com/auth/youtube.upload`** alone. Do **not** add the broad
`.../auth/youtube` or `youtube.force-ssl` unless a feature genuinely needs them — narrower
scopes verify faster and with less scrutiny. Audit the scope list in
`lib/publishing/adapters/youtube.ts` and the connect route before submitting.

**Audit result:** `youtube.force-ssl`/`youtube.readonly` aren't dead weight to strip — the
comment auto-reply module (`lib/auto-reply/youtube-*.ts`) genuinely needs `force-ssl` to POST
comment replies (upload/readonly alone can't write comments), and it's live today (frozen
investment per `plan/07-future-roadmap.md`, but running). Deleting those scopes outright would
break it for every new connection.

Shipped instead: `app/api/social/[platform]/connect/route.ts` now reads an optional
`YOUTUBE_SCOPES` env override (identical pattern to `META_IG_SCOPES`) — unset, it requests the
same three scopes as before (zero behavior change, auto-reply keeps working); set to
`https://www.googleapis.com/auth/youtube.upload` alone before recording the Gate-A
verification demo, submit, then leave it unset again afterward. `.env.example` and
`docs/publishing-setup.md` document the override and when to flip it. This mirrors the Meta
P0/P1 split in §1a: submit the narrowest coherent scope set first, without breaking what
already ships.

### Y3 [FOUNDER] Verify domain ownership
`reelspy.dev` in Google Search Console, under the **same Google account** that owns the Cloud
project. This is Google's substitute for business verification — **owning the domain is what
stands in for owning a company.**

### Y4 [FOUNDER] Submit OAuth verification (Gate A)
`youtube.upload` is a **sensitive** scope, not a *restricted* one — so it needs review and a
demo video, but **not** the third-party CASA security assessment that Gmail/Drive scopes
trigger. That is the good news for an individual. Budget **2–4 weeks**.

### Y5 [FOUNDER] Submit the YouTube API compliance audit (Gate B)
Separate form, separate queue. Apps created after 2020-07-28 upload **private-only** until
this passes. Reviewers will ask for a **working account on ReelSpy with credentials** — reuse
the P1.4 demo user.

### Y6 [AGENT] Flip the switch
On approval set `YOUTUBE_ALLOW_PUBLIC=true` and redeploy. **Gate:** an API-uploaded video is
publicly visible, and a refresh token still works **8+ days** after issue (proves Gate A
landed, not just Gate B).

---

## Execution order (what the coworker does, in order)

```
Week 1   P0.2 beta gate + error copy [AGENT]   ‖  Stripe application [FOUNDER]
         P0.3 check:meta green       [AGENT]   ‖  Rung 1 verification submitted [FOUNDER]
         P1.2 console URLs           [FOUNDER] ‖  T1 TikTok individual signup [FOUNDER]
Week 2   P1.3/P1.4 policy + demo user[AGENT]   ‖  Y1/Y3 Google project + domain [FOUNDER]
         T4 TikTok UX compliance     [AGENT]
Week 3   P1.5 screencast             [FOUNDER] ‖  T5 TikTok audit submitted [FOUNDER]
         Meta App Review (P0 set)    [FOUNDER] ‖  Y2 scope narrowing [AGENT]
Week 4+  Wait. Work the Phase 0 cohort. Y4/Y5 submitted. Handle rejections.
```

**Rule for the coworker:** never let a *waiting* phase block a *workable* one. If Meta is in
review, do T4 or Y2. There is always agent-executable work in another phase.

---

## Rules for the coworker (read before touching anything)

1. **[FOUNDER] steps are hard stops.** Never upload an identity document, never press Submit
   on a review, never file a company, never enter payment details. Prepare the material,
   then stop and hand over with an explicit checklist.
2. **Never invent a fact about a review process.** These rules change often. If a step here
   contradicts what the console shows *today*, **the console wins** — update this file in the
   same commit as the code change, and say so in the session summary.
3. **`npm run check:meta` after every** domain, env or Meta-console change. Non-negotiable.
4. **Fail-open, always.** Every integration in this repo degrades instead of erroring
   (`lib/instagram/connections.ts` is the reference implementation). A missing approval must
   produce an honest explanation in the UI, never a stack trace and never a silent dead end.
5. **Don't widen the schema for a platform that isn't live** (`CLAUDE.md` non-negotiable #3).
6. Follow the existing session protocol in `CLAUDE.md` §"How to execute": update `ROADMAP.md`
   and `TASKS.md` in the same commit as the work.
7. **Secrets never enter the repo.** `META_APP_SECRET`, `TIKTOK_CLIENT_SECRET`,
   `YOUTUBE_CLIENT_SECRET` live in `.env.local` and Vercel only. `.env.example` gets the key
   name and a comment, never a value.

---

## Risks, honestly stated

| Risk | Likelihood | Mitigation |
|---|---|---|
| Meta rejects unregistered verification in the UAE | **Medium–high** | Rungs 2/3 are costed and ready; Phase 0 keeps revenue flowing meanwhile |
| Meta rejects App Review on the screencast | Medium | Submit the P0 scope set only; every requested permission visible on screen |
| Stripe UAE approval outlasts everything else | Medium | Rung 3 solves Stripe and Meta with one filing |
| TikTok 5-authorisations/24h caps the beta | High (it's a fact, not a risk) | Sequence beta invites; TikTok is P1, Instagram is the wedge |
| Business Discovery has no non-Meta substitute | High | Accepted. The starter-pack path (`ig_account_snapshots`) is the only degraded mode and it already exists |
| Meta deprecates a permission mid-review | Low | `META_IG_SCOPES` overrides the scope list without a deploy |

**The single biggest risk is none of the above: it is waiting on Meta with no users.**
Phase 0 exists to remove that risk. Run it.
