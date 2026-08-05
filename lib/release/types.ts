// Shape of the product changelog. Deliberately tiny and free of any server or
// React dependency: the same objects are rendered in the dashboard, serialised
// by the public endpoint, and asserted over by test/release/release-notes.test.ts.
//
// Every string is `Localized` on purpose — because `Dict` is inferred from the
// English side, a missing Arabic translation is a compile error rather than a
// silent English fallback (see lib/i18n/dictionaries/index.ts for the same idea).

/**
 * The only three words a release note may categorise a change with. They are
 * user-facing categories, not engineering ones: there is deliberately no
 * "chore", "refactor", "perf" or "breaking" — if a change is invisible to the
 * person paying for ReelSpy, it does not belong in the changelog at all.
 */
export const CHANGE_KINDS = ["new", "improved", "fixed"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export type Localized = {
  en: string;
  ar: string;
};

export type Change = {
  kind: ChangeKind;
  text: Localized;
};

export type Release = {
  /** MAJOR.MINOR.PATCH — see docs/RELEASING.md for what bumps which part. */
  version: string;
  /** YYYY-MM-DD (UTC): the day it reached users, not the day it was written. */
  date: string;
  /** Short headline — the one thing this release is about. */
  title: Localized;
  /** One or two sentences a non-technical user can read on its own. */
  summary: Localized;
  changes: Change[];
  /**
   * Worth interrupting for. Drives the one-time "What's new" dialog; leave it
   * off for small fix-only releases so the popup keeps its meaning.
   */
  spotlight?: boolean;
};
