// Lazily-constructed Stripe client (L6 / B1). Server-only. Returns null when
// STRIPE_SECRET_KEY isn't configured so callers can respond with a clean "billing
// isn't set up yet" instead of throwing — the founder wires the keys after the
// Stripe UAE account is approved, and the app must build/run before then.
//
// One shared instance per server process (Stripe recommends reuse). The API
// version is pinned so a Stripe-side default bump can't silently change payloads.

import "server-only";
import Stripe from "stripe";
import { getSiteUrl } from "@/lib/site";

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key, {
      apiVersion: "2025-02-24.acacia",
      appInfo: { name: "ReelSpy", url: getSiteUrl() },
    });
  }
  return cached;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

// True when Stripe says the object simply isn't there: deleted in the dashboard,
// or left over from a different account or the other mode (a test↔live key swap
// keeps our stored ids but invalidates every one of them). Callers treat this as
// "that reference is dead, start fresh" rather than as a hard failure — without
// it a single stale id makes checkout/portal fail for that user forever.
export function isMissingResource(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: string; code?: string; statusCode?: number };
  return (
    e.code === "resource_missing" ||
    (e.type === "StripeInvalidRequestError" && e.statusCode === 404)
  );
}

// The absolute origin to build Checkout return URLs against. Prefers an explicit
// NEXT_PUBLIC_SITE_URL, else falls back to the incoming request's origin (correct
// on Vercel, which sets the deployment host on request.url).
export function siteOrigin(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return new URL(request.url).origin;
}
