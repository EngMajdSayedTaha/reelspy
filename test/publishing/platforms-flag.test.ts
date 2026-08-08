import { describe, it, expect } from "vitest";
import { PLATFORMS } from "@/lib/publishing/types";
import {
  PLATFORMS_FLAG_DEFAULT,
  PLATFORMS_FLAG_KEY,
  normalizePlatformsFlag,
  readPlatformsFlag,
} from "@/lib/publishing/platforms-flag";
import { memoryDb } from "@/test/helpers/memory-table";
import { throwingSupabase } from "@/test/helpers/fake-supabase";

describe("normalizePlatformsFlag", () => {
  it("treats an absent row as every platform enabled", () => {
    expect(normalizePlatformsFlag(undefined)).toEqual(PLATFORMS_FLAG_DEFAULT);
    for (const platform of PLATFORMS) {
      expect(normalizePlatformsFlag(null)[platform]).toBe(true);
      expect(normalizePlatformsFlag({})[platform]).toBe(true);
    }
  });

  it("only an explicit false disables a platform", () => {
    expect(normalizePlatformsFlag({ tiktok: "false" }).tiktok).toBe(true);
    expect(normalizePlatformsFlag({ tiktok: 0 }).tiktok).toBe(true);
    expect(normalizePlatformsFlag({ tiktok: false }).tiktok).toBe(false);
  });

  it("ignores unknown keys and leaves other platforms untouched", () => {
    const flag = normalizePlatformsFlag({ tiktok: false, somethingElse: false });
    expect(flag.tiktok).toBe(false);
    expect(flag.instagram).toBe(true);
    expect(flag.youtube).toBe(true);
  });
});

describe("readPlatformsFlag", () => {
  it("reads the app_settings row", async () => {
    const db = memoryDb({
      app_settings: [{ key: PLATFORMS_FLAG_KEY, value: { tiktok: false } }],
    });
    const flag = await readPlatformsFlag(db.client);
    expect(flag.tiktok).toBe(false);
    expect(flag.instagram).toBe(true);
  });

  it("resolves to all-enabled when the row is missing", async () => {
    const db = memoryDb({ app_settings: [] });
    expect(await readPlatformsFlag(db.client)).toEqual(PLATFORMS_FLAG_DEFAULT);
  });

  it("resolves to all-enabled — never disabled — when the read throws", async () => {
    // Guessing "disabled" during a DB blip would silently break publishing
    // for every paying customer.
    expect(await readPlatformsFlag(throwingSupabase())).toEqual(PLATFORMS_FLAG_DEFAULT);
  });
});
