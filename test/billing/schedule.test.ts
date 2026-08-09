import { describe, it, expect, afterEach, vi } from "vitest";
import type Stripe from "stripe";
import {
  buildPhases,
  currentPhaseOf,
  pendingFromSchedule,
  scheduleIdOf,
} from "@/lib/billing/schedule";

// The deferred-plan-change rules, pinned without a Stripe client. What these
// assert is the actual promise the billing UI makes: the period the customer
// already paid for is reproduced untouched, and the new plan only ever starts
// after it.

const NOW = 1_700_000_000; // arbitrary "now" in unix seconds
const PERIOD_START = NOW - 10 * 86_400;
const PERIOD_END = NOW + 20 * 86_400;

afterEach(() => {
  vi.unstubAllEnvs();
});

function phase(overrides: Partial<Stripe.SubscriptionSchedule.Phase> = {}) {
  return {
    start_date: PERIOD_START,
    end_date: PERIOD_END,
    items: [{ price: "price_creator", quantity: 1 }],
    metadata: null,
    ...overrides,
  } as unknown as Stripe.SubscriptionSchedule.Phase;
}

function schedule(overrides: Partial<Stripe.SubscriptionSchedule> = {}) {
  return {
    id: "sub_sched_1",
    status: "active",
    phases: [phase()],
    ...overrides,
  } as unknown as Stripe.SubscriptionSchedule;
}

describe("currentPhaseOf", () => {
  it("picks the phase that has started and not ended", () => {
    const next = phase({ start_date: PERIOD_END, end_date: PERIOD_END + 30 * 86_400 });
    const current = currentPhaseOf(schedule({ phases: [phase(), next] }), NOW);
    expect(current?.start_date).toBe(PERIOD_START);
  });

  it("falls back to the first phase when nothing brackets now", () => {
    const future = phase({ start_date: NOW + 5, end_date: NOW + 100 });
    expect(currentPhaseOf(schedule({ phases: [future] }), NOW)?.start_date).toBe(NOW + 5);
  });

  it("returns null for a schedule with no phases", () => {
    expect(currentPhaseOf(schedule({ phases: [] }), NOW)).toBeNull();
  });
});

describe("pendingFromSchedule", () => {
  it("is null when only the current phase exists — nothing is scheduled", () => {
    expect(pendingFromSchedule(schedule(), NOW)).toBeNull();
  });

  it("is null once the schedule is finished, even if phases remain", () => {
    for (const status of ["released", "canceled", "completed"]) {
      const next = phase({ start_date: PERIOD_END, items: [{ price: "price_pro", quantity: 1 }] as never });
      expect(pendingFromSchedule(schedule({ status, phases: [phase(), next] } as never), NOW)).toBeNull();
    }
  });

  it("reads the tier from the future phase's Stripe price", () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    const next = phase({
      start_date: PERIOD_END,
      items: [{ price: "price_pro", quantity: 1 }] as never,
    });
    const pending = pendingFromSchedule(schedule({ phases: [phase(), next] }), NOW);
    expect(pending).toMatchObject({ tier: "pro", scheduleId: "sub_sched_1", priceAed: 149 });
    expect(pending?.effectiveAt).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it("falls back to phase metadata for a custom plan's ad-hoc price", () => {
    const entitlements = {
      accounts: 40,
      scripts_mo: 80,
      transcripts_mo: 40,
      automations: 10,
      publish_targets: 2,
      ig_connections: 1,
      model: "opus",
    };
    const next = phase({
      start_date: PERIOD_END,
      items: [{ price: "price_custom_adhoc", quantity: 1 }] as never,
      metadata: {
        tier: "custom",
        price_aed: "217",
        custom_entitlements: JSON.stringify(entitlements),
      } as never,
    });
    const pending = pendingFromSchedule(schedule({ phases: [phase(), next] }), NOW);
    expect(pending?.tier).toBe("custom");
    expect(pending?.priceAed).toBe(217);
    expect(pending?.entitlements).toMatchObject({ accounts: 40, model: "opus" });
  });

  it("ignores a phase whose price and metadata name no known tier", () => {
    const next = phase({
      start_date: PERIOD_END,
      items: [{ price: "price_unknown", quantity: 1 }] as never,
      metadata: {} as never,
    });
    expect(pendingFromSchedule(schedule({ phases: [phase(), next] }), NOW)).toBeNull();
  });

  // Once prices are admin-managed, "which plan does this price sell" stops being
  // an env lookup. The resolver is injected so a phase priced from an older
  // (archived) generation still resolves instead of reading as nothing pending.
  it("resolves the phase's tier through an injected resolver", () => {
    const next = phase({
      start_date: PERIOD_END,
      items: [{ price: "price_archived_generation", quantity: 1 }] as never,
      metadata: {} as never,
    });
    const pending = pendingFromSchedule(
      schedule({ phases: [phase(), next] }),
      NOW,
      (priceId) => (priceId === "price_archived_generation" ? "studio" : null)
    );
    expect(pending?.tier).toBe("studio");
  });

  it("survives unparsable custom_entitlements without dropping the change", () => {
    const next = phase({
      start_date: PERIOD_END,
      items: [{ price: "price_custom_adhoc", quantity: 1 }] as never,
      metadata: { tier: "custom", custom_entitlements: "{not json" } as never,
    });
    const pending = pendingFromSchedule(schedule({ phases: [phase(), next] }), NOW);
    expect(pending?.tier).toBe("custom");
    expect(pending?.entitlements).toBeNull();
  });
});

describe("buildPhases", () => {
  const target = {
    userId: "user-1",
    tier: "studio" as const,
    priceId: "price_studio",
    priceAed: 349,
    entitlements: null,
  };

  it("reproduces the paid period verbatim so it can never be re-priced", () => {
    const [current] = buildPhases(phase(), target);
    expect(current.start_date).toBe(PERIOD_START);
    expect(current.end_date).toBe(PERIOD_END);
    expect(current.items).toEqual([{ price: "price_creator", quantity: 1 }]);
    expect(current.proration_behavior).toBe("none");
  });

  it("appends the new plan as the next phase, unprorated", () => {
    const [, next] = buildPhases(phase(), target);
    expect(next.items).toEqual([{ price: "price_studio", quantity: 1 }]);
    expect(next.end_date).toBeUndefined();
    expect(next.proration_behavior).toBe("none");
    expect(next.metadata).toMatchObject({ user_id: "user-1", tier: "studio", price_aed: "349" });
  });

  it("carries a custom plan's entitlements on the phase metadata", () => {
    const entitlements = {
      accounts: 55,
      scripts_mo: 120,
      transcripts_mo: 60,
      automations: 20,
      publish_targets: 3,
      ig_connections: 1,
      model: "sonnet" as const,
    };
    const [, next] = buildPhases(phase(), {
      userId: "user-1",
      tier: "custom",
      priceId: "price_custom_adhoc",
      priceAed: 210,
      entitlements,
    });
    expect(JSON.parse((next.metadata as Record<string, string>).custom_entitlements)).toEqual(entitlements);
  });

  it("normalizes expanded price objects back to ids", () => {
    const expanded = phase({
      items: [{ price: { id: "price_creator" }, quantity: 2 }] as never,
    });
    const [current] = buildPhases(expanded, target);
    expect(current.items).toEqual([{ price: "price_creator", quantity: 2 }]);
  });
});

describe("scheduleIdOf", () => {
  it("reads both the string and expanded forms", () => {
    expect(scheduleIdOf({ schedule: "sub_sched_9" } as never)).toBe("sub_sched_9");
    expect(scheduleIdOf({ schedule: { id: "sub_sched_9" } } as never)).toBe("sub_sched_9");
    expect(scheduleIdOf({ schedule: null } as never)).toBeNull();
  });
});
