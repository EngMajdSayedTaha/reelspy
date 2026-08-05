// The technical half of versioning — which exact build is serving this request.
//
// Deliberately separate from lib/release/releases.ts: that file is the product
// version users see and read notes about, this one is the commit an engineer
// needs when a report says "it broke after the last deploy". It is only ever
// rendered inside /admin, so nothing here is exposed to a normal user, and
// nothing here needs a translation.
//
// Server-only: Vercel injects these at build time and they are not NEXT_PUBLIC,
// so they must not be imported from a client component.

import { CURRENT_RELEASE, CURRENT_VERSION } from "./version";

export type BuildInfo = {
  /** Product version — the one in the sidebar and the changelog. */
  version: string;
  /** Date that version reached users (YYYY-MM-DD). */
  releasedAt: string;
  /** Short commit hash of the running build, or null outside Vercel. */
  commit: string | null;
  /** Git branch the build came from, or null outside Vercel. */
  branch: string | null;
  /** Vercel environment: production / preview / development. */
  environment: string;
  /** Commit subject line, useful for spotting a hotfix at a glance. */
  commitMessage: string | null;
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getBuildInfo(): BuildInfo {
  const sha = clean(process.env.VERCEL_GIT_COMMIT_SHA);
  return {
    version: CURRENT_VERSION,
    releasedAt: CURRENT_RELEASE.date,
    commit: sha ? sha.slice(0, 7) : null,
    branch: clean(process.env.VERCEL_GIT_COMMIT_REF),
    environment: clean(process.env.VERCEL_ENV) ?? process.env.NODE_ENV ?? "development",
    commitMessage: clean(process.env.VERCEL_GIT_COMMIT_MESSAGE),
  };
}
