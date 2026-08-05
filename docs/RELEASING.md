# Releasing ReelSpy

> Every user-visible change ships as a numbered release with a note the customer
> can read. This file is the rulebook for how that happens.
>
> **Source of truth:** [`lib/release/releases.ts`](../lib/release/releases.ts).
> There is no `CHANGELOG.md` — a second copy would drift the first time someone
> shipped in a hurry.

## 1. One product, one version

Users don't know that ReelSpy is two deployments. There is therefore **one
product version**, and the dashboard repo owns it.

| Where | What it shows | Source |
|---|---|---|
| Dashboard sidebar (bottom) | `v0.12.0` pill + a dot when there's something new | `CURRENT_VERSION` |
| `/dashboard/whats-new` | Full history, plain language, EN + AR | `RELEASES` |
| One-time dialog after an update | The newest `spotlight` release | `RELEASES[0]` |
| `reelspy.dev/changelog` (marketing) | Same history, public | `GET /api/public/changelog` |
| `/admin/ops` → Build | Commit, branch, environment | `VERCEL_GIT_*` env |

The marketing site **fetches** the changelog rather than keeping its own copy, so
a release note is written exactly once. If the fetch fails it renders a short
fallback instead of stale content — a marketing page must never quietly show a
changelog that is a month behind.

## 2. What bumps which number

`MAJOR.MINOR.PATCH`, read as a **product** version, not an API contract. Nobody
integrates against ReelSpy, so SemVer's "breaking change" axis has nothing to
describe here. What users care about is *how big is this*.

| Part | Bump it when | Example |
|---|---|---|
| **MAJOR** | The product enters a new era. `1.0.0` = out of beta and publicly launched. | `0.x` → `1.0.0` |
| **MINOR** | Anything a user can see that wasn't there before — a feature, a screen, a new limit, a price change, a new language. | `0.11.0` → `0.12.0` |
| **PATCH** | Fixes and polish only. Nothing new to learn. | `0.12.0` → `0.12.1` |

**Invisible work does not get a release.** A rewrite that changes nothing on
screen is not a version bump and not a changelog entry — it ships inside the next
release that has something to say.

While the product is pre-launch, MAJOR stays `0`. The first public launch is
`1.0.0` and nothing else.

## 3. Shipping a release

1. **Add the entry at the top of `RELEASES`** in `lib/release/releases.ts`
   (newest first, always).
2. **Set `version` in `package.json` to match.** CI fails if they disagree —
   that check is what makes the pill in the sidebar trustworthy.
3. **Write the notes** — see §4.
4. **Set `spotlight: true`** only if it deserves to interrupt someone mid-task.
   A release everybody dismisses teaches them to dismiss the next one, so
   fix-only releases should not have it.
5. **Update `docs/BUSINESS-LOGIC.md`** in the same PR if a rule, limit or price
   moved (that rule predates this one and still stands).
6. `npm test` — the release tests in `test/release/` enforce most of §4
   mechanically.
7. Merge to `master`. Vercel deploys, and the dot appears for everyone who
   hasn't caught up.

Nothing else to run. There is no tag step, no release script, and no separate
publish — the deploy *is* the release.

## 4. How to write the notes

The reader is a creator who pays for ReelSpy, not an engineer. They want to know
what is different for them, in the words they'd use themselves.

**Three categories, and only three:**

| Category | Means | Sounds like |
|---|---|---|
| `new` | Something exists that didn't before | "Download an account's full history as a spreadsheet." |
| `improved` | Something that already existed got better | "The feed opens with the newest reels first." |
| `fixed` | Something that was wrong is now right | "Connecting Instagram from a phone works now." |

There is deliberately no `chore`, `refactor`, `perf` or `breaking`.

**Rules:**

- **Describe the effect, never the cause.** `fixed` is the escape hatch for
  anything technical. A user doesn't need to know it was a race in the job queue
  — only that the thing that looked stuck no longer looks stuck.
- **No engineering vocabulary.** `test/release/release-notes.test.ts` holds a
  banned-word list (endpoint, webhook, migration, cache, deploy, …) and fails the
  build over it. Product nouns the interface already uses — sync, transcript,
  reel, plan, hook — are fine.
- **Both languages, every time.** TypeScript won't let you omit `ar`, and the
  test rejects English pasted into the Arabic slot.
- **One sentence per change**, ending in a full stop. If it needs two sentences,
  it's probably two changes.
- **Say "you", not "users".** "You only pay the difference" beats "users are
  charged a prorated amount".
- **Leave founder-only work out.** Changes only visible inside `/admin` are not
  release notes — they're commit messages.

Good and bad, same change:

> ❌ Fixed a race condition in the archive job that caused an infinite retry loop
> when the upsert failed.
>
> ✅ A history pull that runs into trouble now tells you what went wrong instead
> of quietly trying forever.

## 5. What each surface does about a new release

- **Sidebar dot** — appears once per release, clears the first time they open
  What's New.
- **One-time dialog** — only for `spotlight` releases, and only for accounts
  created *before* that release. A brand-new signup is caught up by definition
  and gets the onboarding quiz instead of a popup about features it never lived
  without.
- **The marker** lives in `profiles.last_seen_version` (migration
  `20260805090000_profile_last_seen_version.sql`) so it follows the user across
  devices.

All of it **fails open**: the whole thing sits inside the dashboard *layout*, so
a missing column, an RLS surprise or a bad stored value resolves to "caught up"
rather than taking every authenticated page down for the sake of a popup.

## 6. The marketing site

`reelspy-landing` has no changelog of its own. Its `package.json` version is kept
in lockstep as a marker, but the page at `reelspy.dev/changelog` renders whatever
`GET /api/public/changelog` returns.

When a release is **only** marketing-site work, it still gets its entry in the
dashboard's `RELEASES` — that's the price of one product having one version, and
it's the right trade: a user reading the changelog should never have to know
which deployment a change landed in.
