# 08 — Known Unknowns & Verification Plan

## Known unknowns (verify during implementation, not assumed by this plan)
- The full plan was produced from a codebase audit, not a running build —
  `lib/instagram/graph-api.ts` (695 lines), `dm-processor.ts`, the four publishing
  adapters, and `my-insights.ts` were skimmed via their call sites, not line-by-line —
  re-read the relevant one before touching it.
- Whether Meta app review currently covers `instagram_content_publish` +
  `instagram_manage_messages` scopes in production (determines whether automations/
  publishing work for non-tester users — a potential hidden launch blocker; check the
  Meta App Dashboard, not the code).
- Stripe UAE account approval lead time (start the application in week 1, it's the
  long pole outside the code).

## Verification checklist, per major item

**Billing (L6 / B1)**
- Stripe test-mode E2E: checkout → webhook → `subscriptions` row → tier limits enforced
  (attempt account #11 on Creator, expect friendly block).
- Vitest on entitlements matrix.

**Activation SLA (L7 / B3)**
- Fresh account through onboarding with a stopwatch; assert the funnel events land in
  `app_events` and the SLA view flags <10 min.

**Wedge quality (L1–L3 / B2, W1, W2)**
- Generate scripts for 5 reels with ready transcripts on Claude vs current Llama output;
  confirm the grounded chip shows; confirm the degraded path still returns an
  un-persisted placeholder (`generate-script/route.ts:88-90` behavior preserved).

**Publishing (L9 / B4, and V6 later)**
- Schedule a post 10 min out on Vercel Pro cron; kill a token mid-flight to trigger the
  failure email + retry button; confirm `partial` status renders.

**PDPL (L12 / B8+H6)**
- Delete a seeded test account; verify cascade left no rows and the R2 prefix is empty;
  export returns all tables sans token columns.

**RTL smoke (part of L10/L11, full pass in V2/X1)**
- Temporarily set `dir="rtl"` on `<html>`; sidebar, feed, generator remain usable after
  the launch-scope logical-property fixes.
