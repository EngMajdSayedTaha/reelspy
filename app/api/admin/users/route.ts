import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { parseListQuery, listResponse } from "@/lib/admin/query";
import { resolveAuthUsers, resolveLastEventAt, findUserIdByEmail } from "@/lib/admin/users";

export const runtime = "nodejs";

const SORTS = ["created_at", "username"] as const;

export type AdminUserRow = {
  id: string;
  username: string | null;
  email: string | null;
  createdAt: string | null;
  isAdmin: boolean;
  tier: string;
  /** Stripe/billing subscription status ("active" | "trialing" | … | "inactive" for no subscription). Not an account-activity signal — see lastActiveAt. */
  status: string;
  /** Most recent of GoTrue last_sign_in_at and the latest tracked app_events row; null if the user has never done either. */
  lastActiveAt: string | null;
  isBanned: boolean;
};

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

// GET /api/admin/users — paginated user directory.
// Search (q): an "@"-containing term is treated as an exact email; a term
// starting with "cus_" as an exact Stripe customer id; anything else as a
// username trigram ILIKE.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const url = new URL(request.url);
  const query = parseListQuery(url, SORTS, "created_at");

  // Resolve a targeted-search term to a set of user ids first, so the main
  // profiles query can filter to them (or short-circuit to empty).
  let restrictIds: string[] | null = null;
  if (query.q) {
    const q = query.q;
    if (q.includes("@")) {
      const id = await findUserIdByEmail(admin, q);
      restrictIds = id ? [id] : [];
    } else if (q.startsWith("cus_")) {
      const { data } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", q);
      restrictIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
    }
  }

  if (restrictIds && restrictIds.length === 0) {
    return NextResponse.json(listResponse<AdminUserRow>([], 0, query));
  }

  let builder = admin
    .from("profiles")
    .select("id, username, created_at, is_admin", { count: "exact" });

  if (restrictIds) {
    builder = builder.in("id", restrictIds);
  } else if (query.q) {
    builder = builder.ilike("username", `%${query.q}%`);
  }

  builder = builder
    .order(query.sort, { ascending: query.dir === "asc" })
    .range(query.from, query.to);

  const { data: profiles, count, error } = await builder;
  if (error) {
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }

  const rows = (profiles ?? []) as {
    id: string;
    username: string | null;
    created_at: string | null;
    is_admin: boolean;
  }[];
  const ids = rows.map((r) => r.id);

  // Auth metadata (email, last sign-in, ban state), last tracked app event, and
  // subscription tier/status — all by id, in parallel.
  const [authById, lastEventById, subsResult] = await Promise.all([
    resolveAuthUsers(admin, ids),
    resolveLastEventAt(admin, ids),
    ids.length
      ? admin.from("subscriptions").select("user_id, tier, status").in("user_id", ids)
      : Promise.resolve({ data: [] as { user_id: string; tier: string; status: string }[] }),
  ]);
  const subsById = new Map(
    ((subsResult.data ?? []) as { user_id: string; tier: string; status: string }[]).map((s) => [
      s.user_id,
      s,
    ])
  );

  const result: AdminUserRow[] = rows.map((r) => {
    const sub = subsById.get(r.id);
    const auth = authById.get(r.id) ?? null;
    return {
      id: r.id,
      username: r.username,
      email: auth?.email ?? null,
      createdAt: r.created_at,
      isAdmin: r.is_admin === true,
      tier: sub?.tier ?? "free",
      status: sub?.status ?? "inactive",
      lastActiveAt: maxIso(auth?.lastSignInAt ?? null, lastEventById.get(r.id) ?? null),
      isBanned: auth?.bannedUntil != null,
    };
  });

  return NextResponse.json(listResponse(result, count, query));
}
