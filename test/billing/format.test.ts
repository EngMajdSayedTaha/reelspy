import { describe, it, expect, afterEach, vi } from "vitest";
import { dayLabel, dayLabelFromUnix, planChangeDirection, planPriceLabel } from "@/lib/billing/format";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dayLabel", () => {
  it("renders one date format for every billing surface", () => {
    expect(dayLabel("2026-08-29T00:00:00Z")).toBe("Aug 29, 2026");
    expect(dayLabelFromUnix(Date.UTC(2026, 7, 29) / 1000)).toBe("Aug 29, 2026");
  });

  it("returns null for anything it can't date, instead of 'Invalid Date'", () => {
    expect(dayLabel(null)).toBeNull();
    expect(dayLabel(undefined)).toBeNull();
    expect(dayLabel("")).toBeNull();
    expect(dayLabel("not a date")).toBeNull();
    expect(dayLabelFromUnix(0)).toBeNull();
    expect(dayLabelFromUnix(null)).toBeNull();
  });
});

describe("planChangeDirection", () => {
  it("reads moves up and down the fixed ladder", () => {
    expect(planChangeDirection("creator", "pro")).toBe("upgrade");
    expect(planChangeDirection("studio", "creator")).toBe("downgrade");
    expect(planChangeDirection("free", "studio")).toBe("upgrade");
    expect(planChangeDirection("pro", "pro")).toBe("change");
  });

  it("describes anything involving the custom plan neutrally", () => {
    // Custom isn't on the ladder — its price depends on the configuration, so
    // calling it an upgrade or a downgrade would be a guess.
    expect(planChangeDirection("pro", "custom")).toBe("change");
    expect(planChangeDirection("custom", "creator")).toBe("change");
  });
});

describe("planPriceLabel", () => {
  it("shows the indicative monthly price of a fixed tier", () => {
    expect(planPriceLabel("creator")).toBe("AED 49");
    expect(planPriceLabel("studio")).toBe("AED 349");
  });

  it("has nothing to show for free, and uses the config's amount for custom", () => {
    expect(planPriceLabel("free")).toBeNull();
    expect(planPriceLabel("custom")).toBeNull();
    expect(planPriceLabel("custom", 217)).toBe("AED 217");
  });
});
