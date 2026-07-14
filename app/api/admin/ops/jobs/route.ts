import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { parseListQuery, listResponse } from "@/lib/admin/query";

export const runtime = "nodejs";

const SORTS = ["created_at", "run_at", "updated_at", "status"] as const;
const COLUMNS =
  "id, kind, status, attempts, max_attempts, run_at, locked_at, locked_by, last_error, dedup_key, user_id, payload, created_at, updated_at";

// GET /api/admin/ops/jobs — durable job queue browser. Optional ?status= filter.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const url = new URL(request.url);
  const query = parseListQuery(url, SORTS, "created_at");
  const status = url.searchParams.get("status") ?? undefined;
  const kind = url.searchParams.get("kind") ?? undefined;

  let builder = admin.from("jobs").select(COLUMNS, { count: "exact" });
  if (status) builder = builder.eq("status", status);
  if (kind) builder = builder.eq("kind", kind);
  builder = builder.order(query.sort, { ascending: query.dir === "asc" }).range(query.from, query.to);

  const { data, count, error } = await builder;
  if (error) return NextResponse.json({ error: "Failed to load jobs." }, { status: 500 });

  return NextResponse.json(
    listResponse((data ?? []) as unknown as Record<string, unknown>[], count, query)
  );
}
