"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { seedStarterPack, finishOnboarding } from "@/app/dashboard/onboarding/actions";
import { bulkAddInspirationAccounts } from "@/app/dashboard/accounts/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

// Seed the zero-quota starter pack (step 1 skip branch). Refreshes so the wizard
// re-evaluates (source + accounts steps flip done).
export function StarterPackButton() {
  const dict = useDict();
  const o = dict.onboarding;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      const res = await seedStarterPack();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(o.addedStarterAccounts(res.added ?? 0));
      router.refresh();
    });
  }

  return (
    <Button variant="outline" onClick={go} disabled={isPending}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
      {o.skipUseStarterPack}
    </Button>
  );
}

// Step 3: add a few accounts by handle (no Business Discovery validation — they
// enrich on first sync), matching the bulk-import path.
export function AddAccountsInline() {
  const dict = useDict();
  const o = dict.onboarding;
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function go() {
    const cleaned = value.trim();
    if (!cleaned) {
      toast.error(o.addAtLeastOneUsername);
      return;
    }
    const data = new FormData();
    data.set("usernames", cleaned);
    startTransition(async () => {
      const res = await bulkAddInspirationAccounts({}, data);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const added = res.added ?? 0;
      toast.success(added > 0 ? o.addedAccounts(added, res.limited ?? 0) : o.alreadyTracked);
      setValue("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        placeholder={o.addUsernamePlaceholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go();
          }
        }}
        disabled={isPending}
      />
      <Button onClick={go} disabled={isPending} className="shrink-0">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {o.addAccounts}
      </Button>
    </div>
  );
}

// Step 4 (connected, no reels yet): pull the feed, then refresh so the wizard can
// route to the top reel.
export function SyncButton() {
  const dict = useDict();
  const o = dict.onboarding;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/ig/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? o.syncFailed);
          return;
        }
        toast.success(o.feedSynced);
        router.refresh();
      } catch {
        toast.error(o.syncFailed);
      }
    });
  }

  return (
    <Button onClick={go} disabled={isPending}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {isPending ? o.syncingFeed : o.syncMyFeed}
    </Button>
  );
}

// Finish / dismiss the wizard and go somewhere useful.
export function FinishButton({
  href = "/dashboard",
  label = "Finish",
  variant = "default",
  withIcon = false,
}: {
  href?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  withIcon?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      await finishOnboarding();
      router.push(href);
    });
  }

  return (
    <Button variant={variant} onClick={go} disabled={isPending}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : withIcon ? <Sparkles className="h-4 w-4" /> : null}
      {label}
    </Button>
  );
}
