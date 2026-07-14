import { describe, it, expect } from "vitest";
import { parseListQuery, listResponse, MAX_PER_PAGE } from "@/lib/admin/query";

const SORTS = ["created_at", "username", "tier"] as const;

function q(params: Record<string, string>): URL {
  const url = new URL("https://x/api/admin/users");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

describe("parseListQuery", () => {
  it("applies defaults when nothing is provided", () => {
    const r = parseListQuery(q({}), SORTS, "created_at");
    expect(r).toMatchObject({ page: 1, perPage: 25, dir: "desc", sort: "created_at", from: 0, to: 24 });
    expect(r.q).toBeUndefined();
  });

  it("computes range from page + per_page", () => {
    const r = parseListQuery(q({ page: "3", per_page: "10" }), SORTS, "created_at");
    expect(r.from).toBe(20);
    expect(r.to).toBe(29);
  });

  it("clamps per_page to the max", () => {
    const r = parseListQuery(q({ per_page: "5000" }), SORTS, "created_at");
    expect(r.perPage).toBe(MAX_PER_PAGE);
  });

  it("falls back to the default sort for a non-allowlisted sort", () => {
    const r = parseListQuery(q({ sort: "is_admin" }), SORTS, "created_at");
    expect(r.sort).toBe("created_at");
  });

  it("accepts an allowlisted sort and direction", () => {
    const r = parseListQuery(q({ sort: "username", dir: "asc" }), SORTS, "created_at");
    expect(r.sort).toBe("username");
    expect(r.dir).toBe("asc");
  });

  it("trims and passes through q; empty q becomes undefined", () => {
    expect(parseListQuery(q({ q: "  hello  " }), SORTS, "created_at").q).toBe("hello");
    expect(parseListQuery(q({ q: "   " }), SORTS, "created_at").q).toBeUndefined();
  });

  it("recovers from an invalid page/per_page rather than throwing", () => {
    const r = parseListQuery(q({ page: "-2", per_page: "0" }), SORTS, "created_at");
    expect(r.page).toBeGreaterThanOrEqual(1);
    expect(r.perPage).toBeGreaterThanOrEqual(1);
  });
});

describe("listResponse", () => {
  it("computes totalPages from the count", () => {
    const query = parseListQuery(q({ per_page: "10" }), SORTS, "created_at");
    const res = listResponse([1, 2, 3], 23, query);
    expect(res.total).toBe(23);
    expect(res.totalPages).toBe(3);
  });

  it("uses row length when count is null and never returns 0 pages", () => {
    const query = parseListQuery(q({}), SORTS, "created_at");
    const res = listResponse([], null, query);
    expect(res.total).toBe(0);
    expect(res.totalPages).toBe(1);
  });
});
