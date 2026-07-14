import "server-only";
import { z } from "zod";

// Shared list-query parsing + response shape for every admin list endpoint.
// Pagination is 1-based `page` + `per_page` (clamped ≤100), optional free-text
// `q`, and an allowlisted `sort` column + direction. The sort allowlist is
// per-endpoint (passed in) so a client can never sort by / probe an arbitrary
// column.

export const MAX_PER_PAGE = 100;

// Fields clamp rather than reject: a tampered/garbage value should still serve
// a sensible page, not 400 the whole request. per_page is clamped to [1,100]
// and page to ≥1 via .catch() defaults + the clamps applied in parseListQuery.
export const listQuerySchema = z.object({
  page: z.coerce.number().int().catch(1),
  per_page: z.coerce.number().int().catch(25),
  q: z.string().trim().max(200).optional().catch(undefined),
  sort: z.string().max(64).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).catch("desc"),
});

export type ListQuery = {
  page: number;
  perPage: number;
  q?: string;
  sort: string;
  dir: "asc" | "desc";
  /** 0-based inclusive range start for supabase .range(). */
  from: number;
  /** 0-based inclusive range end for supabase .range(). */
  to: number;
};

export type ListResponse<T> = {
  rows: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

// Parse the URL search params of an admin list request. `sortAllowlist` is the
// set of columns this endpoint permits sorting on; `defaultSort` must be one of
// them. An out-of-allowlist sort silently falls back to the default rather than
// erroring — the UI only ever sends allowlisted values, so a bad value means a
// tampered request, and we'd rather serve the default page than 400.
export function parseListQuery(
  url: URL,
  sortAllowlist: readonly string[],
  defaultSort: string
): ListQuery {
  const parsed = listQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    per_page: url.searchParams.get("per_page") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
  });

  const v = parsed.success
    ? parsed.data
    : { page: 1, per_page: 25, q: undefined, sort: undefined, dir: "desc" as const };

  const page = Math.max(1, v.page);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, v.per_page));
  const sort = v.sort && sortAllowlist.includes(v.sort) ? v.sort : defaultSort;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  return {
    page,
    perPage,
    q: v.q && v.q.length > 0 ? v.q : undefined,
    sort,
    dir: v.dir,
    from,
    to,
  };
}

export function listResponse<T>(rows: T[], count: number | null, query: ListQuery): ListResponse<T> {
  const total = count ?? rows.length;
  return {
    rows,
    page: query.page,
    perPage: query.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.perPage)),
  };
}
