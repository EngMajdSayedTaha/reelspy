"use client";

import { useEffect, useState } from "react";
import { SuggestedAccountCard, SUGGESTIONS_HIDDEN_KEY } from "./SuggestedAccountCard";
import type { SuggestedAccount } from "@/lib/suggestions/accounts";

type Props = {
  accounts: SuggestedAccount[];
  niche?: string;
};

// Client filter shell around the server-fetched suggestion list: reads the
// locally-dismissed usernames once on mount and removes cards as the user
// dismisses them, without a round-trip to the DB.
export function SuggestedAccountsList({ accounts, niche }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const restore = () => {
      try {
        const raw = window.localStorage.getItem(SUGGESTIONS_HIDDEN_KEY);
        const stored: string[] = raw ? JSON.parse(raw) : [];
        setHidden(new Set(stored));
      } catch {
        // localStorage unavailable — nothing was ever dismissed this session.
      }
    };
    restore();
  }, []);

  const visible = accounts.filter((a) => !hidden.has(a.igUsername.toLowerCase()));
  if (visible.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((account) => (
        <SuggestedAccountCard
          key={account.igUsername}
          account={account}
          niche={niche}
          onHide={(username) =>
            setHidden((prev) => new Set(prev).add(username.toLowerCase()))
          }
        />
      ))}
    </div>
  );
}
