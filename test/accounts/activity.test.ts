import { describe, expect, it } from "vitest";
import { bucketByDay, mergeActivity, type ActivityItem } from "@/lib/accounts/activity";

function item(over: Partial<ActivityItem> & Pick<ActivityItem, "id" | "at">): ActivityItem {
  return { kind: "synced", ...over };
}

describe("bucketByDay", () => {
  it("collapses an archive's thousands of rows into one entry per day", () => {
    // An archive materializes every reel within the same second. Un-bucketed
    // this is 2,000 identical timeline entries.
    const timestamps = Array.from({ length: 2_000 }, (_, i) =>
      new Date(Date.UTC(2026, 5, 14, 9, 0, i % 60)).toISOString()
    );
    const items = bucketByDay(timestamps, "reels_added");

    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(2_000);
    expect(items[0].kind).toBe("reels_added");
    expect(items[0].id).toBe("reels_added:2026-06-14");
  });

  it("stamps each bucket at the newest timestamp inside it", () => {
    // So a bucketed item still sorts correctly against un-bucketed ones.
    const items = bucketByDay(
      [
        "2026-06-14T09:00:00.000Z",
        "2026-06-14T23:59:00.000Z",
        "2026-06-14T12:00:00.000Z",
      ],
      "reels_added"
    );
    expect(items).toHaveLength(1);
    expect(items[0].at).toBe("2026-06-14T23:59:00.000Z");
  });

  it("splits across UTC day boundaries", () => {
    const items = bucketByDay(
      ["2026-06-14T23:59:59.000Z", "2026-06-15T00:00:01.000Z"],
      "reels_added"
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.count)).toEqual([1, 1]);
  });

  it("ignores nulls rather than bucketing them under a fake day", () => {
    expect(bucketByDay([null, null], "reels_added")).toEqual([]);
    const items = bucketByDay([null, "2026-06-14T09:00:00.000Z", null], "reels_added");
    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(1);
  });

  it("returns nothing for an empty input", () => {
    expect(bucketByDay([], "transcripts_ready")).toEqual([]);
  });
});

describe("mergeActivity", () => {
  it("sorts newest first across sources", () => {
    const merged = mergeActivity([
      item({ id: "a", at: "2026-01-01T00:00:00.000Z" }),
      item({ id: "c", at: "2026-03-01T00:00:00.000Z" }),
      item({ id: "b", at: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(merged.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("keeps the first of two items describing the same action", () => {
    // A jobs row and an app_events row for one archive request collide on id.
    const merged = mergeActivity([
      item({ id: "archive_requested:acc", at: "2026-01-01T00:00:00.000Z", label: "from events" }),
      item({ id: "archive_requested:acc", at: "2026-01-01T00:00:00.000Z", label: "from jobs" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].label).toBe("from events");
  });

  it("keeps every distinct item that shares a timestamp", () => {
    const at = "2026-06-14T09:00:00.000Z";
    const merged = mergeActivity([
      item({ id: "reels_added:2026-06-14", at, kind: "reels_added", count: 12 }),
      item({ id: "archive_completed:acc", at, kind: "archive_completed" }),
      item({ id: "synced:1", at, kind: "synced" }),
    ]);
    expect(merged).toHaveLength(3);
  });

  it("drops items with no timestamp instead of sorting them to the top", () => {
    const merged = mergeActivity([
      item({ id: "dated", at: "2026-01-01T00:00:00.000Z" }),
      item({ id: "undated", at: "" }),
    ]);
    expect(merged.map((i) => i.id)).toEqual(["dated"]);
  });

  it("caps the result", () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({ id: `i${i}`, at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() })
    );
    const merged = mergeActivity(items, 40);
    expect(merged).toHaveLength(40);
    // Capped from the newest end, not the oldest.
    expect(merged[0].id).toBe("i199");
  });
});
