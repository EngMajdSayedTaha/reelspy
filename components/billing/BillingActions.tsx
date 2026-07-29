"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PaidTier } from "@/lib/billing/plans";
import { useDict } from "@/lib/i18n/I18nProvider";

// Every write action on the billing page lives here, and every one of them opens
// a confirmation dialog first that spells out — in full sentences — what will
// happen, WHEN it will happen, and what will be charged. No money or plan state
// ever changes on a single click.

export type CheckoutResponse = {
  url?: string;
  scheduled?: boolean;
  kept?: boolean;
  resumed?: boolean;
  tier?: string;
  tierName?: string;
  effectiveOnLabel?: string | null;
  cancelAtPeriodEnd?: boolean;
  accessUntilLabel?: string | null;
  error?: string;
};

export async function postJson(
  url: string,
  fallbackError: string,
  body?: unknown
): Promise<CheckoutResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: fallbackError }));
}

// Start Checkout (no subscription yet) or SCHEDULE a change for the next renewal
// (already subscribed). Label + variant are set by the caller so the same button
// reads "Upgrade" / "Subscribe" / "Switch plan" as appropriate.
export function SubscribeButton({
  tier,
  label,
  variant = "default",
  disabled,
  planName,
  priceLabel,
  currentPlanName,
  effectiveOnLabel,
  direction = "change",
  hasSubscription = false,
}: {
  tier: PaidTier;
  label: string;
  variant?: "default" | "outline" | "secondary";
  disabled?: boolean;
  /** Display name of the plan being bought. */
  planName: string;
  /** e.g. "AED 149" — what it costs per month. */
  priceLabel: string;
  /** Display name of the plan the user is on today. */
  currentPlanName: string;
  /** Renewal date the change would take effect on ("Aug 29, 2026"). */
  effectiveOnLabel?: string | null;
  direction?: "upgrade" | "downgrade" | "change";
  /** True when the user already pays for a plan — then this SCHEDULES a change. */
  hasSubscription?: boolean;
}) {
  const dict = useDict();
  const t = dict.billing;
  const confirm = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function go() {
    const ok = hasSubscription
      ? await confirm({
          title:
            direction === "upgrade"
              ? t.switchConfirm.upgradeTitle(planName)
              : direction === "downgrade"
                ? t.switchConfirm.downgradeTitle(planName)
                : t.switchConfirm.changeTitle(planName),
          description: effectiveOnLabel
            ? t.switchConfirm.body(currentPlanName, planName, effectiveOnLabel, priceLabel) +
              (direction === "downgrade"
                ? t.switchConfirm.downgradeNote(currentPlanName, effectiveOnLabel)
                : "")
            : t.switchConfirm.bodyNoDate(currentPlanName, planName, priceLabel),
          confirmText:
            direction === "upgrade"
              ? t.switchConfirm.upgradeCta
              : direction === "downgrade"
                ? t.switchConfirm.downgradeCta
                : t.switchConfirm.changeCta,
        })
      : await confirm({
          title: t.subscribeConfirm.title(planName),
          description: t.subscribeConfirm.body(planName, priceLabel),
          confirmText: t.subscribeConfirm.cta,
        });
    if (!ok) return;

    setLoading(true);
    const result = await postJson("/api/billing/checkout", dict.common.unknownError, { tier });

    if (result.url) {
      window.location.href = result.url;
      return; // keep the spinner through the redirect
    }
    if (result.scheduled) {
      const name = result.tierName ?? planName;
      toast.success(
        result.effectiveOnLabel
          ? t.switchConfirm.scheduled(name, result.effectiveOnLabel)
          : t.switchConfirm.scheduledNoDate(name)
      );
      router.refresh();
      setLoading(false);
      return;
    }
    if (result.kept || result.resumed) {
      toast.success(t.scheduledChange.kept(result.tierName ?? currentPlanName));
      router.refresh();
      setLoading(false);
      return;
    }
    toast.error(result.error ?? t.couldNotStartCheckout);
    setLoading(false);
  }

  return (
    <Button onClick={go} variant={variant} disabled={disabled || loading} className="w-full">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}

// Call off a scheduled plan change — the user stays where they are.
export function KeepCurrentPlanButton({
  currentPlanName,
  pendingPlanName,
  effectiveOnLabel,
}: {
  currentPlanName: string;
  pendingPlanName: string;
  effectiveOnLabel: string | null;
}) {
  const dict = useDict();
  const t = dict.billing;
  const confirm = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function go() {
    const ok = await confirm({
      title: t.scheduledChange.confirmTitle(pendingPlanName),
      description: t.scheduledChange.confirmBody(
        currentPlanName,
        pendingPlanName,
        effectiveOnLabel ?? ""
      ),
      confirmText: t.scheduledChange.confirmCta,
    });
    if (!ok) return;

    setLoading(true);
    const result = await postJson("/api/billing/plan", dict.common.unknownError, {
      action: "keep_current",
    });
    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    toast.success(t.scheduledChange.kept(result.tierName ?? currentPlanName));
    router.refresh();
    setLoading(false);
  }

  return (
    <Button onClick={go} variant="outline" size="sm" disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {t.scheduledChange.keep}
    </Button>
  );
}

// Cancel at period end — the paid period is always honoured in full.
export function CancelSubscriptionButton({
  planName,
  accessUntilLabel,
  className,
}: {
  planName: string;
  accessUntilLabel: string | null;
  className?: string;
}) {
  const dict = useDict();
  const t = dict.billing;
  const confirm = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function go() {
    const ok = await confirm({
      title: t.cancelPlan.title(planName),
      description: accessUntilLabel
        ? t.cancelPlan.body(planName, accessUntilLabel)
        : t.cancelPlan.bodyNoDate(planName),
      confirmText: t.cancelPlan.cta,
      destructive: true,
    });
    if (!ok) return;

    setLoading(true);
    const result = await postJson("/api/billing/plan", dict.common.unknownError, { action: "cancel" });
    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    toast.success(
      result.accessUntilLabel
        ? t.cancelPlan.done(result.accessUntilLabel)
        : t.cancelPlan.doneNoDate
    );
    router.refresh();
    setLoading(false);
  }

  return (
    <Button onClick={go} variant="outline" disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {t.cancelPlan.action}
    </Button>
  );
}

// Take a scheduled cancellation back.
export function ResumeSubscriptionButton({
  planName,
  renewsOnLabel,
  priceLabel,
}: {
  planName: string;
  renewsOnLabel: string | null;
  priceLabel: string;
}) {
  const dict = useDict();
  const t = dict.billing;
  const confirm = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function go() {
    const ok = await confirm({
      title: t.resumePlan.title(planName),
      description: renewsOnLabel
        ? t.resumePlan.body(planName, renewsOnLabel, priceLabel)
        : t.resumePlan.bodyNoDate(planName),
      confirmText: t.resumePlan.cta,
    });
    if (!ok) return;

    setLoading(true);
    const result = await postJson("/api/billing/plan", dict.common.unknownError, { action: "resume" });
    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    toast.success(t.resumePlan.done(result.tierName ?? planName));
    router.refresh();
    setLoading(false);
  }

  return (
    <Button onClick={go} size="sm" disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {t.resumePlan.action}
    </Button>
  );
}

// Open the Stripe Billing Portal to update the card or download invoices. Plan
// changes stay in-app (they need the end-of-period confirmation flow), so the
// dialog makes clear the portal is for payment details and history.
export function ManageBillingButton({ className }: { className?: string }) {
  const dict = useDict();
  const t = dict.billing;
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);

  async function go() {
    const ok = await confirm({
      title: t.portalConfirm.title,
      description: t.portalConfirm.body,
      confirmText: t.portalConfirm.cta,
    });
    if (!ok) return;

    setLoading(true);
    const { url, error } = await postJson("/api/billing/portal", dict.common.unknownError);
    if (url) {
      window.location.href = url;
      return;
    }
    toast.error(error ?? t.couldNotOpenPortal);
    setLoading(false);
  }

  return (
    <Button onClick={go} variant="outline" disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {t.manageBilling}
    </Button>
  );
}
