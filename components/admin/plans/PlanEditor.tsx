"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EntitlementsEditor } from "@/components/admin/users/EntitlementsEditor";
import { PricingSection } from "@/components/admin/plans/PricingSection";
import { requestJson, notifyError, ApiError } from "@/lib/utils/api";
import { DEFAULT_CUSTOM_ENTITLEMENTS, type Entitlements } from "@/lib/billing/entitlements";
import type { AdminPlanRow, AdminPlanCopy } from "@/lib/admin/plans";
import { LOCALES, type Locale } from "@/lib/i18n/config";

// A whole page rather than a modal: there is no Dialog primitive in this repo,
// and a plan has more to say than a modal comfortably holds.
//
// Two rules the UI has to make impossible to miss, because they cut opposite
// ways:
//   - PRICES are grandfathered. Editing one never touches an existing subscriber.
//   - LIMITS are not. They resolve live from the catalog, so a reduction reaches
//     existing subscribers on their next page load — the API refuses it once
//     until the admin confirms.

const LOCALE_LABELS: Record<Locale, string> = { en: "English", ar: "العربية" };

type Draft = {
  sortOrder: number;
  trialDays: number;
  entitlements: Entitlements;
  copy: Record<Locale, AdminPlanCopy>;
};

function toDraft(plan: AdminPlanRow): Draft {
  return {
    sortOrder: plan.sortOrder,
    trialDays: plan.trialDays,
    entitlements: plan.entitlements ?? DEFAULT_CUSTOM_ENTITLEMENTS,
    copy: plan.copy,
  };
}

export function PlanEditor({ planId }: { planId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [plan, setPlan] = useState<AdminPlanRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      try {
        const res = await requestJson<{ plan: AdminPlanRow }>(`/api/admin/plans/${planId}`);
        if (signal?.cancelled) return;
        setPlan(res.plan);
        setDraft(toDraft(res.plan));
        setError(null);
      } catch (err) {
        if (!signal?.cancelled) setError(err instanceof Error ? err.message : "Failed to load the plan.");
      }
    },
    [planId]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  // Every write goes through here so the "limits were lowered" 409 is handled in
  // exactly one place: the API refuses once, explains who it affects, and only
  // then do we re-send with the acknowledgement.
  const patch = useCallback(
    async (body: Record<string, unknown>, successMessage: string) => {
      setSaving(true);
      try {
        const send = (extra: Record<string, unknown> = {}) =>
          requestJson<{ plan: AdminPlanRow }>(`/api/admin/plans/${planId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, ...extra }),
          });

        let res: { plan: AdminPlanRow };
        try {
          res = await send();
        } catch (err) {
          const needsConfirmation =
            err instanceof ApiError && (err.body as { needsConfirmation?: boolean })?.needsConfirmation;
          if (!needsConfirmation) throw err;
          const proceed = await confirm({
            title: "These limits apply to existing subscribers",
            description: `${err.message} Prices are grandfathered; limits are not.`,
            confirmText: "Lower the limits anyway",
            destructive: true,
          });
          if (!proceed) return;
          res = await send({ confirmLoweredLimits: true });
        }

        setPlan(res.plan);
        setDraft(toDraft(res.plan));
        toast.success(successMessage);
        router.refresh();
      } catch (err) {
        notifyError(err, "Could not save the plan.");
      } finally {
        setSaving(false);
      }
    },
    [planId, confirm, router]
  );

  if (error) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        {error}
      </div>
    );
  }

  if (!plan || !draft) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const setCopy = (locale: Locale, next: Partial<AdminPlanCopy>) =>
    setDraft({ ...draft, copy: { ...draft.copy, [locale]: { ...draft.copy[locale], ...next } } });

  const publish = async () => {
    await patch({ status: "published", ...draftPayload(draft) }, "Published — customers can see and buy it.");
  };

  const archive = async () => {
    const ok = await confirm({
      title: `Archive ${plan.copy.en.name || plan.slug}?`,
      description:
        plan.subscribers > 0
          ? `${plan.subscribers} active subscriber${plan.subscribers === 1 ? " keeps" : "s keep"} this plan and carry on being billed for it — it just disappears for new customers. You can un-archive it at any time.`
          : "It disappears from the pricing page. Nothing is deleted, and you can un-archive it at any time.",
      confirmText: "Archive plan",
      destructive: true,
    });
    if (!ok) return;
    await patch({ status: "archived" }, "Archived — it's no longer offered to new customers.");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ms-2 mb-1">
            <Link href="/admin/plans">
              <ArrowLeft className="h-4 w-4" /> All plans
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            {plan.copy.en.name || plan.slug}
            <Badge variant={plan.status === "published" ? "default" : "outline"}>{plan.status}</Badge>
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {plan.slug}
            {plan.slugLocked ? " · fixed (subscriptions reference it)" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/billing?preview_plan=${plan.slug}`} target="_blank">
              Preview as customer <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
          {plan.status !== "published" ? (
            <Button size="sm" onClick={publish} disabled={saving}>
              Publish
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={archive} disabled={saving}>
              Archive
            </Button>
          )}
        </div>
      </div>

      {plan.status === "draft" ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          This plan is a draft: it isn&apos;t shown on the pricing page and checkout refuses it. Publish it
          when the copy, limits and price are right.
        </div>
      ) : null}

      {/* ── Limits ── */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Limits &amp; AI model</CardTitle>
          <CardDescription>
            What this plan grants, enforced everywhere. Unlike prices, these are <strong>not</strong>{" "}
            grandfathered — a change reaches the {plan.subscribers} current subscriber
            {plan.subscribers === 1 ? "" : "s"} immediately. Use -1 for unlimited.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <EntitlementsEditor
            value={draft.entitlements}
            onChange={(entitlements) => setDraft({ ...draft, entitlements })}
          />
        </CardContent>
      </Card>

      {/* ── Copy ── */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Customer-facing copy</CardTitle>
          <CardDescription>
            What appears on the pricing card, per language. One feature per line.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 pt-4 lg:grid-cols-2">
          {LOCALES.map((locale) => {
            const rtl = locale === "ar";
            return (
              <div key={locale} className="flex flex-col gap-3">
                <p className="text-sm font-medium text-foreground">{LOCALE_LABELS[locale]}</p>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    dir={rtl ? "rtl" : "ltr"}
                    value={draft.copy[locale].name}
                    onChange={(e) => setCopy(locale, { name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Tagline</Label>
                  <Input
                    dir={rtl ? "rtl" : "ltr"}
                    value={draft.copy[locale].tagline}
                    onChange={(e) => setCopy(locale, { tagline: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Badge (optional, e.g. Most popular)</Label>
                  <Input
                    dir={rtl ? "rtl" : "ltr"}
                    value={draft.copy[locale].badge ?? ""}
                    onChange={(e) => setCopy(locale, { badge: e.target.value || null })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Feature bullets (one per line)</Label>
                  <textarea
                    dir={rtl ? "rtl" : "ltr"}
                    rows={6}
                    value={draft.copy[locale].highlights.join("\n")}
                    onChange={(e) =>
                      setCopy(locale, {
                        highlights: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean),
                      })
                    }
                    className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Pricing ── */}
      {plan.kind === "fixed" ? (
        <PricingSection plan={plan} onChanged={() => load()} />
      ) : plan.kind === "custom" ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Pricing</CardTitle>
            <CardDescription>
              This plan prices each configuration itself from the build-your-own rate card, so it has no
              fixed price to set here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {/* ── Presentation & trial ── */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Presentation &amp; trial</CardTitle>
          <CardDescription>Where the card sits on the pricing page, and any free trial.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              Sort order (lower is first; also the upgrade ladder)
            </Label>
            <Input
              type="number"
              value={draft.sortOrder}
              onChange={(e) => setDraft({ ...draft, sortOrder: Math.trunc(Number(e.target.value) || 0) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Free trial (days, 0 for none)</Label>
            <Input
              type="number"
              value={draft.trialDays}
              onChange={(e) =>
                setDraft({ ...draft, trialDays: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => patch(draftPayload(draft), "Saved — live for customers within about a minute.")}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={() => setDraft(toDraft(plan))} disabled={saving}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function draftPayload(draft: Draft) {
  return {
    sortOrder: draft.sortOrder,
    trialDays: draft.trialDays,
    entitlements: draft.entitlements,
    copy: draft.copy,
  };
}
