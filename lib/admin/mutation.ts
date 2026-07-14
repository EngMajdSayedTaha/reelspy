import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AdminContext } from "@/lib/admin/auth";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";

// Consume one `admin_mutation` token for the acting admin. Returns a 429
// NextResponse when the admin is over their hourly mutation budget, else null.
// Every mutating admin handler calls this right after the gate and before it
// writes anything.
export async function guardAdminMutation(ctx: AdminContext): Promise<NextResponse | null> {
  const { allowed, retryAfterSeconds } = await consumeUserAction(
    ctx.supabase,
    ctx.user.id,
    "admin_mutation"
  );
  if (allowed) return null;
  return NextResponse.json(
    { error: "You're making changes very quickly — try again shortly.", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

// Parse + validate a JSON request body against a zod schema. Returns a discriminated
// result: on failure, a ready-to-return 400 NextResponse with the first issue.
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".");
    const message = first ? `${path ? `${path}: ` : ""}${first.message}` : "Invalid request body.";
    return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}
