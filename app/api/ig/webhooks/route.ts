import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCommentChange } from "@/lib/auto-reply/processor";
import { processDirectMessage } from "@/lib/auto-reply/dm-processor";
import type {
  CommentWebhookValue,
  InstagramWebhookPayload,
  MessagingWebhookEvent,
} from "@/lib/auto-reply/types";

// Meta webhook endpoint for the Auto-Reply module (Instagram `comments` and
// `messages` fields).
//
// GET  → one-time subscription verification handshake (App Dashboard setup).
// POST → comment notifications. Meta expects a fast 200 and retries on
//        failure/slow responses, so the response goes out immediately and the
//        actual processing runs in after(); webhook retries are absorbed by
//        the unique comment_id in automation_events.
export const runtime = "nodejs";
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge") ?? "";
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && safeEqual(token, expected)) {
    // Meta requires the raw challenge echoed back as plain text.
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("Webhook received but META_APP_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // The HMAC is computed over the raw bytes — read the body BEFORE parsing.
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

  if (!safeEqual(signature, expected)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: InstagramWebhookPayload;
  try {
    payload = JSON.parse(raw) as InstagramWebhookPayload;
  } catch {
    return new Response("Malformed payload", { status: 400 });
  }

  if (payload.object !== "instagram") {
    return NextResponse.json({ ignored: true });
  }

  // Meta batches: one POST can carry several entries, each with several
  // comment changes and/or messaging (DM) events.
  const changes: Array<{ igAccountId: string; value: CommentWebhookValue }> = [];
  const messages: Array<{ igAccountId: string; event: MessagingWebhookEvent }> = [];
  for (const entry of payload.entry ?? []) {
    if (!entry.id) continue;
    for (const change of entry.changes ?? []) {
      if (change.field === "comments" && change.value?.id) {
        changes.push({ igAccountId: entry.id, value: change.value });
      }
    }
    for (const event of entry.messaging ?? []) {
      if (event.message?.mid) {
        messages.push({ igAccountId: entry.id, event });
      }
    }
  }

  if (changes.length > 0 || messages.length > 0) {
    after(async () => {
      const admin = createAdminClient();
      for (const change of changes) {
        try {
          await processCommentChange(admin, change.igAccountId, change.value);
        } catch (error) {
          // Swallow per-change failures: Meta will redeliver, and the dedupe
          // insert keeps redelivery safe.
          console.error("Auto-reply: comment processing failed", error);
        }
      }
      for (const message of messages) {
        try {
          await processDirectMessage(admin, message.igAccountId, message.event);
        } catch (error) {
          console.error("Auto-reply: DM processing failed", error);
        }
      }
    });
  }

  return NextResponse.json({ received: true });
}
