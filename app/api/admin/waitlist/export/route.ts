import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { ENTRY_COLUMNS, type WaitlistEntry } from "@/lib/waitlist/entry";
import { entriesToCsv } from "@/lib/waitlist/review";

export const runtime = "nodejs";

// Hard ceiling on one export. Well above any plausible closed-beta list, and it
// keeps a single request from trying to serialize an unbounded table into
// memory if this ever runs on a list that grew past "beta".
const MAX_ROWS = 10_000;

// GET /api/admin/waitlist/export?status=pending — CSV of the list.
//
// The founder will want this for a mail merge, an investor update, or just to
// sort it in a spreadsheet. Exports the same filter the panel is showing.
// Audited, because this is a bulk read of other people's email addresses.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const valid = ["pending", "invited", "approved", "rejected"].includes(status ?? "");

  let builder = admin
    .from("waitlist_entries")
    .select(ENTRY_COLUMNS)
    .order("queue_number", { ascending: true })
    .limit(MAX_ROWS);
  if (valid && status) builder = builder.eq("status", status);

  const { data, error } = await builder;
  if (error) {
    return NextResponse.json({ error: "Couldn't export the waiting list." }, { status: 500 });
  }

  const rows = (data ?? []) as WaitlistEntry[];
  const csv = entriesToCsv(rows);

  await writeAudit(admin, {
    adminId: user.id,
    action: "waitlist.export",
    targetType: "waitlist_entry",
    targetId: null,
    payload: { status: valid ? status : "all", rows: rows.length },
    ip,
    userAgent,
  });

  // A BOM so Excel opens the UTF-8 correctly — Arabic names are expected here.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reelspy-waitlist-${valid ? status : "all"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
