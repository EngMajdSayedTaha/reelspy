"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaidTier } from "@/lib/billing/plans";
import { useDict } from "@/lib/i18n/I18nProvider";

export async function postJson(
  url: string,
  fallbackError: string,
  body?: unknown
): Promise<{ url?: string; switched?: boolean; tier?: string; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: fallbackError }));
}

// Start Checkout for a paid tier. Label + variant are set by the caller so the
// same button reads "Upgrade" / "Subscribe" / "Switch plan" as appropriate.
export function SubscribeButton({
  tier,
  label,
  variant = "default",
  disabled,
}: {
  tier: PaidTier;
  label: string;
  variant?: "default" | "outline" | "secondary";
  disabled?: boolean;
}) {
  const dict = useDict();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    const { url, switched, error } = await postJson(
      "/api/billing/checkout",
      dict.common.unknownError,
      { tier }
    );
    if (url) {
      window.location.href = url;
      return; // keep the spinner through the redirect
    }
    if (switched) {
      // In-place plan change (existing subscriber) — no redirect; refresh the
      // server component so the new plan + usage limits render immediately.
      toast.success(dict.billing.planSwitched ?? "Plan updated.");
      router.refresh();
      setLoading(false);
      return;
    }
    toast.error(error ?? dict.billing.couldNotStartCheckout);
    setLoading(false);
  }

  return (
    <Button onClick={go} variant={variant} disabled={disabled || loading} className="w-full">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}

// Open the Stripe Billing Portal to update card / change plan / cancel.
export function ManageBillingButton({ className }: { className?: string }) {
  const dict = useDict();
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    const { url, error } = await postJson("/api/billing/portal", dict.common.unknownError);
    if (url) {
      window.location.href = url;
      return;
    }
    toast.error(error ?? dict.billing.couldNotOpenPortal);
    setLoading(false);
  }

  return (
    <Button onClick={go} variant="outline" disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {dict.billing.manageBilling}
    </Button>
  );
}
