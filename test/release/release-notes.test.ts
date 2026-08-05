import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { RELEASES } from "@/lib/release/releases";
import { CHANGE_KINDS, type Localized } from "@/lib/release/types";
import { CURRENT_RELEASE, CURRENT_VERSION, compareVersions } from "@/lib/release/version";

// The guard rails behind docs/RELEASING.md. Release notes are the one artefact
// in this repo written for the customer rather than for us, and the failure mode
// is silent: a half-translated note or a paragraph of engineering vocabulary
// still compiles, still deploys, and is only ever noticed by the person paying
// for the product. So the rules are enforced here instead of trusted to review.

const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ARABIC = /[؀-ۿ]/;

// Words that mean nothing to a creator trying to work out what changed. This is
// deliberately a list of ENGINEERING vocabulary, not of "hard words" — product
// nouns the UI already uses (sync, transcript, reel, plan, hook) are fine, and
// "fixed" exists precisely so a technical cause can be described by its effect.
//
// Adding a word here is cheap. Adding an exception is not: if a note genuinely
// needs one of these, the note is describing the implementation rather than the
// change, and should be rewritten.
const BANNED_TERMS = [
  "api", "endpoint", "webhook", "middleware", "rpc", "sql", "schema", "rls",
  "migration", "database", "query", "backend", "frontend", "serverless",
  "refactor", "refactored", "regression", "idempotent", "nullable", "null",
  "boolean", "race condition", "stack trace", "exception", "cron", "cache",
  "latency", "payload", "deserialize", "repo", "repository", "commit",
  "deploy", "deployed", "deployment", "rollback", "hotfix", "feature flag",
  "env var", "environment variable", "sdk", "jwt", "oauth", "cdn", "dns",
  "hydration", "polyfill", "bundle", "mutex", "memoize", "timeout", "throughput",
];

// Long enough for a real sentence, short enough that nobody pastes a paragraph.
const MAX_CHANGE_LENGTH = 240;
const MAX_SUMMARY_LENGTH = 320;
const MAX_TITLE_LENGTH = 80;

function everyString(): { where: string; value: Localized }[] {
  const out: { where: string; value: Localized }[] = [];
  for (const release of RELEASES) {
    out.push({ where: `${release.version} title`, value: release.title });
    out.push({ where: `${release.version} summary`, value: release.summary });
    release.changes.forEach((change, i) => {
      out.push({ where: `${release.version} change[${i}]`, value: change.text });
    });
  }
  return out;
}

describe("changelog structure", () => {
  it("has at least one release", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
  });

  it("uses MAJOR.MINOR.PATCH versions, each one unique", () => {
    const seen = new Set<string>();
    for (const release of RELEASES) {
      expect(release.version, `${release.version} is not MAJOR.MINOR.PATCH`).toMatch(SEMVER);
      expect(seen.has(release.version), `${release.version} appears twice`).toBe(false);
      seen.add(release.version);
    }
  });

  it("is ordered newest first, by version and by date", () => {
    for (let i = 1; i < RELEASES.length; i += 1) {
      const newer = RELEASES[i - 1];
      const older = RELEASES[i];
      expect(
        compareVersions(newer.version, older.version),
        `${newer.version} must sort above ${older.version}`
      ).toBeGreaterThan(0);
      // Non-increasing rather than strictly decreasing: two releases can share a
      // day when a hotfix follows a feature.
      expect(
        newer.date >= older.date,
        `${newer.version} (${newer.date}) is dated before ${older.version} (${older.date})`
      ).toBe(true);
    }
  });

  it("dates every release with a real calendar day", () => {
    for (const release of RELEASES) {
      expect(release.date, `${release.version} date`).toMatch(ISO_DATE);
      const parsed = new Date(`${release.date}T00:00:00Z`);
      expect(Number.isNaN(parsed.getTime()), `${release.version} date is not real`).toBe(false);
      // Round-trips: catches 2026-02-31 style values that Date happily rolls over.
      expect(parsed.toISOString().slice(0, 10)).toBe(release.date);
    }
  });

  it("gives every release at least one change, with a known category", () => {
    for (const release of RELEASES) {
      expect(release.changes.length, `${release.version} has no changes`).toBeGreaterThan(0);
      for (const change of release.changes) {
        expect(CHANGE_KINDS).toContain(change.kind);
      }
    }
  });
});

describe("release notes are written for users", () => {
  it("translates every string into both languages", () => {
    for (const { where, value } of everyString()) {
      expect(value.en.trim().length, `${where} is missing English`).toBeGreaterThan(0);
      expect(value.ar.trim().length, `${where} is missing Arabic`).toBeGreaterThan(0);
      // The realistic failure is English pasted into the Arabic slot to unblock
      // a build. Requiring actual Arabic script catches it; a note may still
      // contain Latin brand names alongside.
      expect(ARABIC.test(value.ar), `${where} Arabic looks untranslated`).toBe(true);
    }
  });

  it("uses no engineering vocabulary", () => {
    for (const { where, value } of everyString()) {
      const haystack = value.en.toLowerCase();
      for (const term of BANNED_TERMS) {
        // Word-boundary match so "null" doesn't fire on "annulled".
        const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        expect(
          pattern.test(haystack),
          `${where} says "${term}" — describe what changed for the user instead`
        ).toBe(false);
      }
    }
  });

  it("keeps every note short enough to actually be read", () => {
    for (const release of RELEASES) {
      for (const locale of ["en", "ar"] as const) {
        expect(release.title[locale].length, `${release.version} title too long`)
          .toBeLessThanOrEqual(MAX_TITLE_LENGTH);
        expect(release.summary[locale].length, `${release.version} summary too long`)
          .toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
        release.changes.forEach((change, i) => {
          expect(change.text[locale].length, `${release.version} change[${i}] too long`)
            .toBeLessThanOrEqual(MAX_CHANGE_LENGTH);
        });
      }
    }
  });

  it("ends every note as a sentence, not a commit subject", () => {
    for (const release of RELEASES) {
      for (const change of release.changes) {
        expect(
          change.text.en.trim().endsWith("."),
          `"${change.text.en}" should end in a full stop`
        ).toBe(true);
      }
    }
  });
});

describe("the shipped version and the changelog agree", () => {
  it("treats the newest entry as the current release", () => {
    expect(CURRENT_RELEASE).toBe(RELEASES[0]);
    expect(CURRENT_VERSION).toBe(RELEASES[0].version);
  });

  // The one rule that makes the version pill trustworthy. If these drift, the
  // sidebar advertises a version whose notes describe something else.
  it("matches the version in package.json", () => {
    const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    expect(
      pkg.version,
      "package.json `version` must equal RELEASES[0].version — see docs/RELEASING.md"
    ).toBe(CURRENT_VERSION);
  });
});
