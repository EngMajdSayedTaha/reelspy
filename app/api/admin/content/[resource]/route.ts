import { NextResponse } from "next/server";
import { requireAdmin, adminNotFound } from "@/lib/admin/auth";
import { parseListQuery, listResponse } from "@/lib/admin/query";
import { getResource } from "@/lib/admin/resources";

export const runtime = "nodejs";

// GET /api/admin/content/[resource] — list rows of an allowlisted content table.
// Requires either a `user` filter or a search `q` so we never dump an entire
// table unscoped. Only the resource's allowlisted columns are ever selected.
export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const { resource } = await params;
  const def = getResource(resource);
  if (!def) return adminNotFound();

  const url = new URL(request.url);
  const userId = url.searchParams.get("user") ?? undefined;
  const query = parseListQuery(url, def.columns, def.defaultSort);

  if (!userId && !query.q) {
    return NextResponse.json(
      { error: "Provide a user filter or a search term." },
      { status: 400 }
    );
  }

  let builder = admin.from(def.table).select(def.columns.join(", "), { count: "exact" });
  if (userId) builder = builder.eq(def.userColumn, userId);
  if (query.q && def.searchColumn) builder = builder.ilike(def.searchColumn, `%${query.q}%`);

  builder = builder.order(query.sort, { ascending: query.dir === "asc" }).range(query.from, query.to);

  const { data, count, error } = await builder;
  if (error) {
    return NextResponse.json({ error: "Failed to load rows." }, { status: 500 });
  }

  return NextResponse.json({
    ...listResponse((data ?? []) as unknown as Record<string, unknown>[], count, query),
    columns: def.columns,
    deletable: def.deletable,
  });
}
