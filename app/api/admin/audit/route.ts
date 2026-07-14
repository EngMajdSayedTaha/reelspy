import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { parseListQuery, listResponse } from "@/lib/admin/query";

export const runtime = "nodejs";

const SORTS = ["created_at"] as const;

// GET /api/admin/audit — the append-only admin audit trail. Filters: action,
// target_type, admin_id, and a created_at date range (from/to ISO). Read-only.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const url = new URL(request.url);
  const query = parseListQuery(url, SORTS, "created_at");
  const action = url.searchParams.get("action") ?? undefined;
  const targetType = url.searchParams.get("target_type") ?? undefined;
  const adminId = url.searchParams.get("admin_id") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  let builder = admin
    .from("admin_audit_log")
    .select("id, admin_id, action, target_type, target_id, payload, ip, user_agent, created_at", {
      count: "exact",
    });

  if (action) builder = builder.eq("action", action);
  if (targetType) builder = builder.eq("target_type", targetType);
  if (adminId) builder = builder.eq("admin_id", adminId);
  if (from) builder = builder.gte("created_at", from);
  if (to) builder = builder.lte("created_at", to);

  builder = builder.order("created_at", { ascending: query.dir === "asc" }).range(query.from, query.to);

  const { data, count, error } = await builder;
  if (error) return NextResponse.json({ error: "Failed to load audit log." }, { status: 500 });

  return NextResponse.json(
    listResponse((data ?? []) as unknown as Record<string, unknown>[], count, query)
  );
}
