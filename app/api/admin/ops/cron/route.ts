import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const maxDuration = 300; // some cron jobs (run-jobs) are long-running

// Hardcoded allowlist of the cron endpoints an admin can trigger on demand. Only
// these exact names are reachable — a name off this list is rejected, so this
// endpoint can never be used to fetch an arbitrary URL.
const CRON_ROUTES = [
  "enrich-seeds",
  "ig-cookie-health",
  "poll-comments",
  "poll-youtube-comments",
  "prune-events",
  "refresh-snapshots",
  "refresh-tokens",
  "run-jobs",
  "weekly-digest",
] as const;

const schema = z.object({ name: z.enum(CRON_ROUTES) });

function originOf(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

// POST /api/admin/ops/cron — run one allowlisted cron endpoint now. Calls it
// server-side with the CRON_SECRET bearer (the same auth Vercel Cron uses) and
// relays its JSON result. Audited.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  const url = `${originOf(request)}/api/cron/${body.data.name}`;
  let status = 0;
  let result: unknown = null;
  let ok = false;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
    });
    status = res.status;
    ok = res.ok;
    result = await res.json().catch(() => null);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach cron endpoint: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 }
    );
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "cron.run",
    targetType: "cron",
    targetId: body.data.name,
    payload: { status, ok },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok, status, name: body.data.name, result });
}
