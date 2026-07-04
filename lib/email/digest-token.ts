// One-click unsubscribe token for the weekly digest (V3/W6). A short HMAC of the
// user id keyed on a server secret, so the unsubscribe link works without a
// login and can't be forged to unsubscribe someone else. Server-only.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Reuse CRON_SECRET as the signing key (server-only, already required for the
// digest cron). The HMAC output is safe to expose; the key never leaves the server.
function signingKey(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}

export function digestUnsubscribeToken(userId: string): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update(`digest:${userId}`).digest("hex").slice(0, 32);
}

export function verifyDigestToken(userId: string, token: string): boolean {
  const expected = digestUnsubscribeToken(userId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The absolute unsubscribe URL embedded in the email. Null when unsigned (no
// CRON_SECRET) — the caller omits the link rather than shipping a broken one.
export function digestUnsubscribeUrl(userId: string): string | null {
  const token = digestUnsubscribeToken(userId);
  if (!token) return null;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://reelspy-one.vercel.app").replace(
    /\/+$/,
    ""
  );
  return `${origin}/api/account/digest-unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;
}
