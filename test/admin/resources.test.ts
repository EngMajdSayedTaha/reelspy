import { describe, it, expect } from "vitest";
import { RESOURCES, getResource, resourceList } from "@/lib/admin/resources";

// Token/secret column names that must NEVER appear in a browsable resource's
// column allowlist (defense in depth on top of not registering the token tables).
const FORBIDDEN = ["access_token", "refresh_token", "ig_access_token", "fb_page_access_token", "token", "secret", "password"];

describe("content resource registry", () => {
  it("returns null for an unknown slug", () => {
    expect(getResource("not_a_table")).toBeNull();
    expect(getResource(undefined)).toBeNull();
    expect(getResource(null)).toBeNull();
  });

  it("resolves a known slug", () => {
    expect(getResource("tracked_reels")?.table).toBe("tracked_reels");
  });

  it("never exposes a token/secret column in any registry entry", () => {
    for (const def of Object.values(RESOURCES)) {
      for (const col of def.columns) {
        for (const bad of FORBIDDEN) {
          expect(col.includes(bad)).toBe(false);
        }
      }
    }
  });

  it("each resource's defaultSort is one of its selectable columns", () => {
    for (const def of Object.values(RESOURCES)) {
      expect(def.columns).toContain(def.defaultSort);
    }
  });

  it("each resource's searchColumn (if set) is selectable", () => {
    for (const def of Object.values(RESOURCES)) {
      if (def.searchColumn) expect(def.columns).toContain(def.searchColumn);
    }
  });

  it("publish_jobs is read-only", () => {
    expect(getResource("publish_jobs")?.deletable).toBe(false);
  });

  it("resourceList mirrors the registry", () => {
    expect(resourceList().length).toBe(Object.keys(RESOURCES).length);
  });
});
