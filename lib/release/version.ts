// Version arithmetic and the "is there something this person hasn't seen?"
// rule. Pure functions only — imported by the dashboard layout (server), the
// sidebar (client), the public endpoint, and the tests.

import { RELEASES } from "./releases";
import type { Release } from "./types";

/** The release users are currently running. Always RELEASES[0]. */
export const CURRENT_RELEASE: Release = RELEASES[0];

/** e.g. "0.12.0". Kept identical to package.json `version` — CI asserts it. */
export const CURRENT_VERSION: string = CURRENT_RELEASE.version;

type Parts = [number, number, number];

/**
 * Parses MAJOR.MINOR.PATCH. Returns null for anything else so a garbage value
 * — a hand-edited database row, a stale cookie — degrades to "unknown" instead
 * of throwing inside a layout render.
 */
export function parseVersion(value: unknown): Parts | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** <0 if a is older, 0 if equal, >0 if a is newer. Unparseable sorts oldest. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export function findRelease(version: string): Release | undefined {
  return RELEASES.find((release) => release.version === version);
}

/** Releases the user has not acknowledged yet, newest first. */
export function releasesSince(lastSeenVersion: string | null | undefined): Release[] {
  if (!parseVersion(lastSeenVersion)) return [];
  return RELEASES.filter((release) => compareVersions(release.version, lastSeenVersion!) > 0);
}

export type UnseenInput = {
  /** profiles.last_seen_version — null for anyone who has never dismissed one. */
  lastSeenVersion: string | null | undefined;
  /** profiles.created_at — ISO string. */
  accountCreatedAt: string | null | undefined;
};

export type UnseenState = {
  /** Show the small dot next to the version pill in the sidebar. */
  hasUnseen: boolean;
  /** Interrupt with the dialog: unseen AND flagged spotlight. */
  shouldSpotlight: boolean;
  /** The release to show in the dialog, if any. */
  release: Release | null;
};

/**
 * Decides what a given user still has to catch up on.
 *
 * The subtle case is a brand-new account: `last_seen_version` is null for them
 * too, but a changelog entry that predates their signup is not news — it is
 * just how the product has always looked. So an account created on or after the
 * latest release's date starts out fully caught up, and gets the onboarding
 * quiz and tour instead of a popup about features it never lived without.
 *
 * Anything unparseable on either side is treated as "caught up" rather than
 * "everything is new" — a bad value must never spam an existing user.
 */
export function unseenState({ lastSeenVersion, accountCreatedAt }: UnseenInput): UnseenState {
  const NOTHING: UnseenState = { hasUnseen: false, shouldSpotlight: false, release: null };

  if (parseVersion(lastSeenVersion)) {
    const pending = releasesSince(lastSeenVersion);
    if (pending.length === 0) return NOTHING;
    const newest = pending[0];
    return {
      hasUnseen: true,
      shouldSpotlight: Boolean(newest.spotlight),
      release: newest,
    };
  }

  // Never acknowledged anything. Fall back to the signup date.
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  if (Number.isNaN(created)) return NOTHING;
  // Compare against midnight UTC of the release day: an account created later
  // the same day already shipped with these changes in place.
  const releasedAt = Date.parse(`${CURRENT_RELEASE.date}T00:00:00Z`);
  if (Number.isNaN(releasedAt) || created >= releasedAt) return NOTHING;

  return {
    hasUnseen: true,
    shouldSpotlight: Boolean(CURRENT_RELEASE.spotlight),
    release: CURRENT_RELEASE,
  };
}
