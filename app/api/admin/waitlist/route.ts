import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { parseListQuery, listResponse } from "@/lib/admin/query";
import { ENTRY_COLUMNS, joinWaitlist, normalizeEmail, type WaitlistEntry } from "@/lib/waitlist/entry";
import { readWaitlistFlag } from "@/lib/waitlist/flag";

export const runtime = "nodejs";

const SORTS = ["created_at", "queue_number", "email", "status"] as const;
const STATUSES = ["pending", "invited", "approved", "rejected"] as const;

// GET /api/admin/waitlist — the review queue.
//
// Standard admin list shape (see lib/admin/query.ts) plus a `status` filter and
// a `stats` block, so the panel gets its counters and its page in one round
// trip instead of five. Search matches email, name, handle or niche.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const url = new URL(request.url);
  const query = parseListQuery(url, SORTS, "created_at");
  const statusParam = url.searchParams.get("status");
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number]) ? statusParam : null;

  let builder = admin.from("waitlist_entries").select(ENTRY_COLUMNS, { count: "exact" });

  if (status) builder = builder.eq("status", status);
  if (query.q) {
    const term = query.q.replace(/[%,()]/g, "");
    builder = builder.or(
      `email.ilike.%${term}%,name.ilike.%${term}%,instagram_handle.ilike.%${term}%,niche.ilike.%${term}%`
    );
  }

  builder = builder.order(query.sort, { ascending: query.dir === "asc" }).range(query.from, query.to);

  const [{ data, count, error }, stats] = await Promise.all([builder, loadStats(admin)]);

  if (error) {
    // An unapplied migration is the likely cause here, and the panel is more
    // useful telling the admin that than showing a bare "failed to load".
    return NextResponse.json(
      { error: "Couldn't read the waiting list. Is the waitlist migration applied?" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ...listResponse((data ?? []) as WaitlistEntry[], count, query),
    stats,
  });
}

export type WaitlistStats = {
  total: number;
  pending: number;
  invited: number;
  approved: number;
  rejected: number;
  last7d: number;
};

// Six head-only counts (no rows transferred) in parallel — cheaper than one
// grouped query round-tripped through PostgREST, and it keeps the panel's
// counters honest rather than derived from the current page.
async function loadStats(admin: SupabaseClient): Promise<WaitlistStats> {
  const empty: WaitlistStats = { total: 0, pending: 0, invited: 0, approved: 0, rejected: 0, last7d: 0 };
  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [total, pending, invited, approved, rejected, last7d] = await Promise.all([
      admin.from("waitlist_entries").select("id", { count: "exact", head: true }),
      admin.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("status", "invited"),
      admin.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("status", "approved"),
      admin.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("status", "rejected"),
      admin.from("waitlist_entries").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);

    return {
      total: total.count ?? 0,
      pending: pending.count ?? 0,
      invited: invited.count ?? 0,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
      last7d: last7d.count ?? 0,
    };
  } catch {
    return empty;
  }
}

// POST /api/admin/waitlist — add someone by hand.
//
// The founder meets a creator at an event and wants them in the queue (or
// straight in). Same idempotent path as the public form, so adding an address
// that's already on the list updates it instead of erroring.
const createSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).optional(),
  instagramHandle: z.string().trim().max(120).optional(),
  niche: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
  approve: z.boolean().optional(),
});

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, createSchema);
  if (!body.ok) return body.response;

  const flag = await readWaitlistFlag(admin);
  const result = await joinWaitlist(admin, {
    email: normalizeEmail(body.data.email),
    name: body.data.name ?? null,
    instagramHandle: body.data.instagramHandle ?? null,
    niche: body.data.niche ?? null,
    note: body.data.note ?? null,
    source: "admin",
    autoApprove: body.data.approve === true || flag.autoApprove,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Couldn't add that address." }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "waitlist.create",
    targetType: "waitlist_entry",
    targetId: result.entry.id,
    payload: { email: result.entry.email, created: result.created, approved: body.data.approve === true },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, entry: result.entry, created: result.created });
}
