import { describe, it, expect } from "vitest";
import {
  CURRENT_RELEASE,
  CURRENT_VERSION,
  compareVersions,
  findRelease,
  parseVersion,
  releasesSince,
  unseenState,
} from "@/lib/release/version";

describe("parseVersion", () => {
  it("parses MAJOR.MINOR.PATCH and tolerates surrounding space", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion(" 0.12.0 ")).toEqual([0, 12, 0]);
  });

  it("returns null for anything that isn't a version", () => {
    for (const bad of ["1.2", "1.2.3.4", "v1.2.3", "", "latest", null, undefined, 42, {}]) {
      expect(parseVersion(bad)).toBeNull();
    }
  });
});

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    // The classic trap: "0.9.0" > "0.12.0" under string comparison.
    expect(compareVersions("0.12.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
    expect(compareVersions("0.1.2", "0.1.10")).toBeLessThan(0);
    expect(compareVersions("2.3.4", "2.3.4")).toBe(0);
  });

  it("sorts unparseable values oldest, so garbage never looks like the future", () => {
    expect(compareVersions("junk", "0.1.0")).toBeLessThan(0);
    expect(compareVersions("0.1.0", "junk")).toBeGreaterThan(0);
    expect(compareVersions("junk", "junk")).toBe(0);
  });
});

describe("releasesSince", () => {
  it("returns everything strictly newer than the given version", () => {
    const all = releasesSince("0.0.1");
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].version).toBe(CURRENT_VERSION);

    expect(releasesSince(CURRENT_VERSION)).toEqual([]);
  });

  it("returns nothing for an unparseable version", () => {
    expect(releasesSince(null)).toEqual([]);
    expect(releasesSince(undefined)).toEqual([]);
    expect(releasesSince("nonsense")).toEqual([]);
  });
});

describe("findRelease", () => {
  it("finds a known version and misses an unknown one", () => {
    expect(findRelease(CURRENT_VERSION)?.version).toBe(CURRENT_VERSION);
    expect(findRelease("99.99.99")).toBeUndefined();
  });
});

describe("unseenState", () => {
  const BEFORE = "2020-01-01T00:00:00.000Z";
  const AFTER = "2999-01-01T00:00:00.000Z";

  it("flags a returning user who last acknowledged an older release", () => {
    const state = unseenState({ lastSeenVersion: "0.0.1", accountCreatedAt: BEFORE });
    expect(state.hasUnseen).toBe(true);
    expect(state.release?.version).toBe(CURRENT_VERSION);
  });

  it("leaves a fully caught-up user alone", () => {
    const state = unseenState({ lastSeenVersion: CURRENT_VERSION, accountCreatedAt: BEFORE });
    expect(state).toEqual({ hasUnseen: false, shouldSpotlight: false, release: null });
  });

  // The case worth writing down: a brand-new account has never acknowledged
  // anything either, but a release that predates its signup is not news to it.
  it("treats an account created after the latest release as caught up", () => {
    const state = unseenState({ lastSeenVersion: null, accountCreatedAt: AFTER });
    expect(state.hasUnseen).toBe(false);
  });

  it("flags an older account that has never acknowledged anything", () => {
    const state = unseenState({ lastSeenVersion: null, accountCreatedAt: BEFORE });
    expect(state.hasUnseen).toBe(true);
    expect(state.release?.version).toBe(CURRENT_VERSION);
  });

  it("stays quiet when both signals are missing or malformed", () => {
    expect(unseenState({ lastSeenVersion: null, accountCreatedAt: null }).hasUnseen).toBe(false);
    expect(unseenState({ lastSeenVersion: "", accountCreatedAt: "not a date" }).hasUnseen).toBe(
      false
    );
  });

  it("only interrupts for a release flagged spotlight", () => {
    const state = unseenState({ lastSeenVersion: "0.0.1", accountCreatedAt: BEFORE });
    expect(state.shouldSpotlight).toBe(Boolean(CURRENT_RELEASE.spotlight));
  });
});
