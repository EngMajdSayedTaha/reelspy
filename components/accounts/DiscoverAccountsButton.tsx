"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SuggestedAccountsList } from "@/components/suggestions/SuggestedAccountsList";
import { suggestNewAccounts } from "@/app/dashboard/accounts/actions";
import type { SuggestedAccount } from "@/lib/suggestions/accounts";
import { useDict } from "@/lib/i18n/I18nProvider";

// On-demand "give me some real accounts to add" — a hand-curated cold-start
// list (lib/suggestions/seed-accounts.ts) independent of the cross-user Niche
// Radar pool the automatic SuggestedAccountsSection draws from, so it still
// has something to offer even when that pool is exhausted (e.g. the user
// already tracks every account anyone else on ReelSpy has added).
export function DiscoverAccountsButton() {
  const dict = useDict().accounts.discover;
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<{ accounts: SuggestedAccount[]; niche?: string } | null>(null);

  const run = () => {
    startTransition(async () => {
      const result = await suggestNewAccounts();
      if (result.error) {
        toast.error(result.error);
        setResults(null);
        return;
      }
      setResults({ accounts: result.accounts ?? [], niche: result.niche ?? undefined });
    });
  };

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" onClick={run} disabled={isPending}>
        <Sparkles className="h-4 w-4" />
        {isPending ? dict.loading : dict.button}
      </Button>

      {results ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {dict.heading}
          </h3>
          <SuggestedAccountsList accounts={results.accounts} niche={results.niche} />
        </div>
      ) : null}
    </div>
  );
}
