# E2E suite

Playwright, driving the real app in a real browser. Three money paths:

| Spec | Path | Why it's here |
| --- | --- | --- |
| `auth.spec.ts` | waiting list → account → sign in | No account, no product. |
| `checkout.spec.ts` | free → Stripe Checkout | No checkout, no revenue. |
| `accounts.spec.ts` | tracking inspiration accounts | The first step of the core loop, and where the upgrade prompt lives. |

## Running it

```bash
npm run e2e
```

Headed, for debugging:

```bash
npm run e2e:headed
```

The config starts `next dev` on port 3100 itself and reuses an already-running
one locally. Env comes from `.env.local`, or `.env.e2e` when that file exists.

The base URL must stay on **`localhost`**, not `127.0.0.1`. Next 16 refuses to
serve dev resources cross-origin and treats those two as different origins, so
`127.0.0.1` gets the server-rendered HTML but none of the client chunks: the
page never hydrates and every form button stays stuck on its server-rendered
`disabled`. The symptom looks like broken selectors and is not.

## What it touches

**This suite writes to whatever Supabase project `.env.local` points at.** Today
that is the production project. It is safe to run, but not free of side effects,
so the rules are worth knowing:

- Every account it creates is `e2e+<uuid>@reelspy.dev`, confirmed via the
  service-role admin API, and hard-deleted in teardown. Deleting the auth user
  cascades to profiles, inspiration accounts and groups.
- The waiting list is currently **on**, so fixtures also insert an `approved`
  `waitlist_entries` row — otherwise every signed-in test would land on
  `/waitlist`. That row is deleted too.
- Fixtures stamp `quiz_completed_at` / `tour_completed_at` / `onboarded_at` on
  the profile, because a brand-new dashboard is covered by a 4-step niche quiz,
  a guided tour and a release spotlight. The quiz has its own test, which opts
  out via `createTestUser(admin, { onboarded: false })`.
- Cleanup lives in fixtures, never at the end of a test body — a test that fails
  half way never reaches its own teardown, and the leaked accounts pile up
  invisibly. Tests that drive signup themselves take the `applicantEmail`
  fixture, which purges the address whichever way the test ends.
- The waiting-list join test submits one address to the public `/api/waitlist`
  endpoint, which may send one "you're on the list" email to `reelspy.dev`.
- `checkout.spec.ts` creates a real Stripe **test-mode** customer and Checkout
  Session. It stops at Stripe's hosted page and never enters card details, so no
  payment is ever completed.

To move all of this off production, create a throwaway Supabase project, apply
`supabase/migrations`, and drop its keys into `.env.e2e`.

## Conventions

- Selectors are roles, labels and visible text. The one exception is the billing
  plan card, located via shadcn's `[data-slot="card"]` wrapper — `CardTitle`
  renders a `div`, so plan names have no heading role to target. Giving those
  titles a real heading would let this drop to `getByRole("heading")` and would
  also fix the page for screen readers.
- Tests share nothing. Each one seeds its own account and deletes it, so they
  run in any order and in parallel.
- Traces and screenshots are captured on failure only.
