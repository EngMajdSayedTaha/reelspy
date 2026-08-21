import { describe, it, expect } from "vitest";
import { CRITICAL_ADMIN_ACTIONS, criticalActionLabel, isCriticalAdminAction } from "@/lib/admin/critical-actions";

// The table decides which admin endpoints re-ask for the passphrase. Getting it
// wrong is silent in both directions — a missed rule leaves a destructive route
// unguarded, an over-broad pattern nags on every read — so both directions are
// pinned here.

describe("isCriticalAdminAction", () => {
  it("covers the actions that hand out or take away access", () => {
    expect(isCriticalAdminAction("POST", "/api/admin/users/8f1e/admin-flag")).toBe(true);
    expect(isCriticalAdminAction("POST", "/api/admin/users/force-reset-all")).toBe(true);
    expect(isCriticalAdminAction("POST", "/api/admin/users/8f1e/ban")).toBe(true);
    expect(isCriticalAdminAction("POST", "/api/admin/users/8f1e/force-reset")).toBe(true);
    expect(isCriticalAdminAction("DELETE", "/api/admin/users/8f1e")).toBe(true);
  });

  it("covers money and destruction", () => {
    expect(isCriticalAdminAction("POST", "/api/admin/billing/subscriptions/8f1e/refund")).toBe(true);
    expect(isCriticalAdminAction("POST", "/api/admin/users/8f1e/tier")).toBe(true);
    expect(isCriticalAdminAction("DELETE", "/api/admin/content/tracked_reels/42")).toBe(true);
  });

  it("covers stored credentials and app-wide switches", () => {
    expect(isCriticalAdminAction("POST", "/api/admin/ig-cookies")).toBe(true);
    expect(isCriticalAdminAction("PUT", "/api/admin/ops/settings")).toBe(true);
    expect(isCriticalAdminAction("POST", "/api/admin/security/passphrase")).toBe(true);
  });

  it("never treats a read as critical", () => {
    expect(isCriticalAdminAction("GET", "/api/admin/users/8f1e")).toBe(false);
    expect(isCriticalAdminAction("GET", "/api/admin/ops/settings")).toBe(false);
    expect(isCriticalAdminAction("GET", "/api/admin/ig-cookies")).toBe(false);
    expect(isCriticalAdminAction("GET", "/api/admin/content/tracked_reels/42")).toBe(false);
  });

  it("leaves everyday, reversible mutations alone", () => {
    expect(isCriticalAdminAction("POST", "/api/admin/users/8f1e/notes")).toBe(false);
    expect(isCriticalAdminAction("POST", "/api/admin/ops/jobs/42")).toBe(false);
    expect(isCriticalAdminAction("PATCH", "/api/admin/waitlist/12")).toBe(false);
    expect(isCriticalAdminAction("POST", "/api/admin/notifications/test")).toBe(false);
  });

  it("matches on the method, not just the path", () => {
    // Reading a user is routine; deleting the same URL is not.
    expect(isCriticalAdminAction("GET", "/api/admin/users/8f1e")).toBe(false);
    expect(isCriticalAdminAction("DELETE", "/api/admin/users/8f1e")).toBe(true);
    expect(isCriticalAdminAction("post", "/api/admin/users/8f1e/ban")).toBe(true);
  });

  it("is not fooled by trailing or doubled slashes", () => {
    expect(isCriticalAdminAction("POST", "/api/admin/users/8f1e/ban/")).toBe(true);
    expect(isCriticalAdminAction("POST", "/api/admin//users/8f1e/ban")).toBe(true);
  });

  it("does not match a deeper path that merely starts the same", () => {
    expect(isCriticalAdminAction("POST", "/api/admin/users/8f1e/ban/extra")).toBe(false);
    expect(isCriticalAdminAction("DELETE", "/api/admin/users/8f1e/notes")).toBe(false);
  });

  it("returns a human label for the re-auth prompt", () => {
    expect(criticalActionLabel("POST", "/api/admin/users/8f1e/admin-flag")).toBe(
      "change who has admin access"
    );
    expect(criticalActionLabel("GET", "/api/admin/users/8f1e")).toBeNull();
  });

  it("every rule has a label that reads as a verb phrase in the prompt", () => {
    for (const rule of CRITICAL_ADMIN_ACTIONS) {
      expect(rule.label.length).toBeGreaterThan(3);
      // Rendered mid-sentence ("Confirm your admin passphrase to <label>."), so
      // it must not open with a capital — proper nouns inside it are fine.
      expect(rule.label[0]).toBe(rule.label[0]!.toLowerCase());
      expect(rule.methods).not.toContain("GET");
    }
  });
});
