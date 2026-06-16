"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "reelspy:cookie-consent";

type Consent = "accepted" | "rejected";

function persist(choice: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
    // Mirror to a cookie so server code can read the choice later if we ever
    // gate analytics/marketing scripts behind it. 1-year, lax.
    document.cookie = `cookie_consent=${choice}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    // Storage can be unavailable (private mode); banner just won't persist.
  }
}

export function CookieConsent() {
  // `null` = not yet determined (SSR/first paint); banner stays hidden until we
  // know the stored choice, avoiding a flash.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        stored = null;
      }
      if (stored !== "accepted" && stored !== "rejected") setVisible(true);
    };
    check();
  }, []);

  if (!visible) return null;

  function choose(choice: Consent) {
    persist(choice);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl shadow-black/30 sm:flex-row sm:items-center sm:gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-brand">
          <Cookie className="h-5 w-5" />
        </span>
        <p className="flex-1 text-sm text-muted-foreground">
          We use essential cookies to keep you signed in and remember your
          preferences. See our{" "}
          <Link href="/cookies" className="font-medium text-brand hover:underline">
            Cookie Policy
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-brand hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
