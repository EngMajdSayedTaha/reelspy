import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readWaitlistFlag } from "@/lib/waitlist/flag";
import {
  clientIp,
  countWaitlist,
  hashIp,
  joinWaitlist,
  normalizeEmail,
} from "@/lib/waitlist/entry";
import { consumeAnonAction } from "@/lib/utils/anon-rate-limit";
import { sendWaitlistConfirmation } from "@/lib/waitlist/email";

export const runtime = "nodejs";
// Both verbs read live state; never let Next try to pre-render this.
export const dynamic = "force-dynamic";

// The PUBLIC waiting-list endpoint. Reachable unauthenticated on both origins:
// app.reelspy.dev directly, and reelspy.dev via the /api/* proxy rewrite in the
// landing project's next.config.ts — which is why the marketing site can post
// here without any CORS setup.

// ── GET: is the waitlist on, and how many are on it? ────────────────────────
//
// The landing page calls this server-side to decide whether its CTAs say "Start
// free" or "Join the waiting list", and to show the social-proof count. It
// deliberately exposes NOTHING but those two numbers.
//
// Cached at the edge for a minute: the landing renders it on every visit, and a
// minute of staleness on a marketing CTA is free, while a DB round trip per
// pageview is not. The dashboard gate does NOT use this path — it reads the
// flag directly, uncached, so an admin's toggle takes effect instantly where it
// actually matters.
export async function GET() {
  try {
    const admin = createAdminClient();
    const flag = await readWaitlistFlag(admin);
    const total = flag.enabled ? await countWaitlist(admin) : 0;

    return NextResponse.json(
      { enabled: flag.enabled, total },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    // Unprovisioned service-role key, unapplied migration — degrade to "off"
    // so the marketing site keeps its normal signup CTAs rather than breaking.
    return NextResponse.json({ enabled: false, total: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
}

// ── POST: join ──────────────────────────────────────────────────────────────

const FOLLOWER_RANGES = ["0-1k", "1k-10k", "10k-50k", "50k-250k", "250k+"] as const;

// Only `email` is required. Every additional required field costs conversion,
// and the founder can always ask later — these exist so the review queue can be
// sorted by fit, not so the form can interrogate people.
const joinSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).optional(),
  instagramHandle: z.string().trim().max(120).optional(),
  niche: z.string().trim().max(80).optional(),
  followerRange: z.enum(FOLLOWER_RANGES).optional(),
  referralSource: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
  locale: z.enum(["en", "ar"]).optional(),
  utm: z.record(z.string(), z.string().max(200)).optional(),
  // Honeypot: a field no human ever sees, so anything in it is a bot. Named
  // plausibly on purpose — "website" is what naive form-fillers reach for.
  website: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "The waiting list isn't available right now." }, { status: 503 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = joinSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.path[0] === "email" ? "Enter a valid email address." : "Check the form and try again." },
      { status: 400 }
    );
  }
  const body = parsed.data;

  // Honeypot trip: answer exactly like a success so the bot has no signal to
  // adapt to, and write nothing.
  if (body.website && body.website.length > 0) {
    return NextResponse.json({ ok: true, alreadyOnList: false, queueNumber: null, total: 0 });
  }

  const flag = await readWaitlistFlag(admin);
  if (!flag.enabled) {
    // Not an error — the marketing page may be serving a cached "waitlist on"
    // CTA for up to a minute after the switch is flipped off. Tell the client
    // to send them to signup instead of showing a failure.
    return NextResponse.json({ ok: false, reason: "closed", signupOpen: true }, { status: 409 });
  }

  const throttle = await consumeAnonAction(admin, hashIp(clientIp(request)), "waitlist_join");
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "That's a lot of requests from here. Try again a bit later." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
    );
  }

  // If the caller happens to be signed in, link the entry to their account
  // immediately — that's the person who signed up, hit the gate, and is filling
  // in the form from the pending screen.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const result = await joinWaitlist(admin, {
    email: normalizeEmail(body.email),
    name: body.name ?? null,
    instagramHandle: body.instagramHandle ?? null,
    niche: body.niche ?? null,
    followerRange: body.followerRange ?? null,
    referralSource: body.referralSource ?? null,
    note: body.note ?? null,
    locale: body.locale ?? null,
    utm: body.utm ?? {},
    source: "landing",
    userId,
    ipHash: hashIp(clientIp(request)),
    userAgent: request.headers.get("user-agent"),
    autoApprove: flag.autoApprove,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Couldn't save that. Try again in a moment." }, { status: 500 });
  }

  const total = await countWaitlist(admin);

  // Confirmation goes out only on a genuinely new entry: re-submitting must not
  // let anyone mail-bomb an address by hammering the form with it. Awaited but
  // never allowed to fail the request — sendEmail returns false, never throws.
  if (result.created && flag.sendEmails) {
    await sendWaitlistConfirmation({
      to: result.entry.email,
      name: result.entry.name,
      queueNumber: result.entry.queue_number,
      total,
    });
  }

  return NextResponse.json({
    ok: true,
    alreadyOnList: !result.created,
    queueNumber: result.entry.queue_number,
    status: result.entry.status,
    total,
  });
}
