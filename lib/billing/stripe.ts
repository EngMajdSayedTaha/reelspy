// Lazily-constructed Stripe client (L6 / B1). Server-only. Returns null when
// STRIPE_SECRET_KEY isn't configured so callers can respond with a clean "billing
// isn't set up yet" instead of throwing — the founder wires the keys after the
// Stripe UAE account is approved, and the app must build/run before then.
//
// One shared instance per server process (Stripe recommends reuse). The API
// version is pinned so a Stripe-side default bump can't silently change payloads.

import "server-only";
import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key, {
      apiVersion: "2025-02-24.acacia",
      appInfo: { name: "ReelSpy", url: "https://reelspy-one.vercel.app" },
    });
  }
  return cached;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

// The absolute origin to build Checkout return URLs against. Prefers an explicit
// NEXT_PUBLIC_SITE_URL, else falls back to the incoming request's origin (correct
// on Vercel, which sets the deployment host on request.url).
export function siteOrigin(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return new URL(request.url).origin;
}
