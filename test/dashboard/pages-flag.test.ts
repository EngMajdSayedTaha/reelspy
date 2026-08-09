import { describe, it, expect } from "vitest";
import { DASHBOARD_PAGES } from "@/lib/dashboard/pages";
import {
  PAGES_FLAG_DEFAULT,
  PAGES_FLAG_KEY,
  normalizePagesFlag,
  readPagesFlag,
} from "@/lib/dashboard/pages-flag";
import { memoryDb } from "@/test/helpers/memory-table";
import { throwingSupabase } from "@/test/helpers/fake-supabase";

describe("normalizePagesFlag", () => {
  it("treats an absent row as every page visible", () => {
    expect(normalizePagesFlag(undefined)).toEqual(PAGES_FLAG_DEFAULT);
    for (const page of DASHBOARD_PAGES) {
      expect(normalizePagesFlag(null)[page.id]).toBe(true);
      expect(normalizePagesFlag({})[page.id]).toBe(true);
    }
  });

  it("only an explicit false hides a page", () => {
    // Free-form jsonb an admin can hand-edit through the generic settings
    // panel too, so "false"/0/"no" must NOT hide a page.
    expect(normalizePagesFlag({ billing: "false" }).billing).toBe(true);
    expect(normalizePagesFlag({ billing: 0 }).billing).toBe(true);
    expect(normalizePagesFlag({ billing: false }).billing).toBe(false);
  });

  it("ignores unknown keys and leaves other pages untouched", () => {
    const flag = normalizePagesFlag({ billing: false, somethingElse: false });
    expect(flag.billing).toBe(false);
    expect(flag.settings).toBe(true);
    expect(flag.accounts).toBe(true);
  });
});

describe("readPagesFlag", () => {
  it("reads the app_settings row", async () => {
    const db = memoryDb({
      app_settings: [{ key: PAGES_FLAG_KEY, value: { publishing: false } }],
    });
    const flag = await readPagesFlag(db.client);
    expect(flag.publishing).toBe(false);
    expect(flag.accounts).toBe(true);
  });

  it("resolves to all-visible when the row is missing", async () => {
    const db = memoryDb({ app_settings: [] });
    expect(await readPagesFlag(db.client)).toEqual(PAGES_FLAG_DEFAULT);
  });

  it("resolves to all-visible — never hidden — when the read throws", async () => {
    // Guessing "hidden" during a DB blip would take working product surface
    // away from every paying customer.
    expect(await readPagesFlag(throwingSupabase())).toEqual(PAGES_FLAG_DEFAULT);
  });
});
