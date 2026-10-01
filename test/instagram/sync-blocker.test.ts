import { describe, it, expect } from "vitest";
import { feedEn, feedAr } from "@/lib/i18n/dictionaries/feed";
import {
  SYNC_BLOCKER_CODES,
  isSyncBlockerCode,
  syncBlockerFor,
} from "@/lib/instagram/sync-blocker";

describe("syncBlockerFor", () => {
  it("tells an Instagram-Login user to reconnect with Facebook", () => {
    // The exact situation that froze sync for five weeks: the only token in
    // the app was an Instagram-Login one, which can't call Business Discovery.
    const blocker = syncBlockerFor("instagram_login", true);
    expect(blocker.code).toBe("needs_facebook_login");
    expect(blocker.message).toMatch(/Facebook/);
  });

  it("asks a Facebook-Login user to reconnect when their token is unusable", () => {
    expect(syncBlockerFor("facebook_login", true).code).toBe("reconnect_required");
    // Legacy rows predate ig_auth_flow and default to Facebook Login.
    expect(syncBlockerFor(null, true).code).toBe("reconnect_required");
  });

  it("asks an unconnected user to connect, whatever the flow column says", () => {
    expect(syncBlockerFor(null, false).code).toBe("not_connected");
    expect(syncBlockerFor("instagram_login", false).code).toBe("not_connected");
  });
});

describe("isSyncBlockerCode", () => {
  it("accepts only known codes", () => {
    for (const code of SYNC_BLOCKER_CODES) expect(isSyncBlockerCode(code)).toBe(true);
    expect(isSyncBlockerCode("reauth_required")).toBe(false);
    expect(isSyncBlockerCode(undefined)).toBe(false);
  });
});

describe("sync blocker copy", () => {
  it("has a localized explanation for every code", () => {
    for (const code of SYNC_BLOCKER_CODES) {
      expect(feedEn.feed.syncBlocked.reasons[code]).toBeTruthy();
      expect(feedAr.feed.syncBlocked.reasons[code]).toBeTruthy();
    }
  });
});
