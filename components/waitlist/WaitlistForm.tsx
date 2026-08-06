"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";

// The join form, used in two places: /waitlist for a signed-out visitor, and
// /signup while the gate is closed. Posts to the same public endpoint the
// marketing site uses.
//
// Conversion shape, deliberately: ONE required field (email) above the fold and
// everything else folded away behind a disclosure. The extra fields exist so the
// review queue can be prioritised by fit — but a form that demands five answers
// before it will take an email address is a form that collects fewer emails.

const FOLLOWER_RANGES = ["0-1k", "1k-10k", "10k-50k", "50k-250k", "250k+"] as const;

type JoinResponse = {
  ok?: boolean;
  alreadyOnList?: boolean;
  queueNumber?: number | null;
  total?: number;
  reason?: string;
  error?: string;
};

export function WaitlistForm({
  defaultEmail,
  total,
  compact = false,
}: {
  defaultEmail?: string | null;
  /** Social-proof count from the server; hidden when 0. */
  total?: number;
  /** Drop the heading — the caller is already providing one. */
  compact?: boolean;
}) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.waitlist;

  const [email, setEmail] = useState(defaultEmail ?? "");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [followerRange, setFollowerRange] = useState("");
  const [referral, setReferral] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [showDetails, setShowDetails] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ already: boolean; queueNumber: number | null } | null>(null);
  const [signupsOpen, setSignupsOpen] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || undefined,
          instagramHandle: handle || undefined,
          niche: niche || undefined,
          followerRange: followerRange || undefined,
          referralSource: referral || undefined,
          locale,
          website: website || undefined,
          utm: readUtm(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as JoinResponse;

      // The gate was lifted while this page was cached — send them to signup
      // rather than showing a failure for something that's good news.
      if (res.status === 409 && body.reason === "closed") {
        setSignupsOpen(true);
        return;
      }
      if (res.status === 429) {
        setError(t.errorThrottled);
        return;
      }
      if (!res.ok || !body.ok) {
        setError(body.error ?? t.errorGeneric);
        return;
      }

      setDone({ already: body.alreadyOnList === true, queueNumber: body.queueNumber ?? null });
    } catch {
      setError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  if (signupsOpen) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold text-foreground">{t.closedHeading}</h2>
        <p className="text-sm text-subtle">{t.closedBody}</p>
        <Button className="w-full" onClick={() => window.location.assign("/signup")}>
          {t.goToSignup}
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-brand" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">
          {done.already ? t.alreadyHeading : t.joinedHeading}
        </h2>
        <p className="text-sm text-subtle">
          {done.queueNumber != null
            ? done.already
              ? t.alreadyBody(done.queueNumber)
              : t.joinedBody(done.queueNumber)
            : t.checkEmail}
        </p>
        {done.queueNumber != null && !done.already ? (
          <p className="text-xs text-muted-foreground">{t.checkEmail}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!compact ? (
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{t.heading}</h2>
          <p className="text-sm text-subtle">{t.sub}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="wl-email">{t.emailLabel}</Label>
        <Input
          id="wl-email"
          type="email"
          required
          autoComplete="email"
          placeholder={t.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {/* Honeypot. Hidden from sight AND from assistive tech, never autofilled;
          anything in it came from a bot and the server silently drops it. */}
      <div aria-hidden className="hidden">
        <label htmlFor="wl-website">Website</label>
        <input
          id="wl-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="flex w-full items-center justify-between text-sm text-subtle transition hover:text-foreground"
        aria-expanded={showDetails}
      >
        {t.optionalDetails}
        <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>

      {showDetails ? (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">{t.optionalHint}</p>

          <div className="space-y-2">
            <Label htmlFor="wl-name">{t.nameLabel}</Label>
            <Input id="wl-name" value={name} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wl-handle">{t.handleLabel}</Label>
            <Input id="wl-handle" value={handle} placeholder={t.handlePlaceholder} onChange={(e) => setHandle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wl-niche">{t.nicheLabel}</Label>
            <Input id="wl-niche" value={niche} placeholder={t.nichePlaceholder} onChange={(e) => setNiche(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wl-followers">{t.followersLabel}</Label>
            <select
              id="wl-followers"
              value={followerRange}
              onChange={(e) => setFollowerRange(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t.followersPlaceholder}</option>
              {FOLLOWER_RANGES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wl-referral">{t.referralLabel}</Label>
            <Input
              id="wl-referral"
              value={referral}
              placeholder={t.referralPlaceholder}
              onChange={(e) => setReferral(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button type="submit" className="w-full" disabled={submitting || !email}>
        {submitting ? t.submitting : t.submit}
      </Button>

      {total && total > 0 ? (
        <p className="text-center text-xs text-muted-foreground">{t.total(total)}</p>
      ) : null}
    </form>
  );
}

// Attribution, best-effort: whatever utm_* params are on the URL when they
// submit. Never throws — a missing `window` (it can't happen in a client
// component, but the guard is free) or a malformed query is just no attribution.
function readUtm(): Record<string, string> {
  try {
    const sp = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const [k, v] of sp.entries()) {
      if (k.startsWith("utm_") && v) utm[k] = v.slice(0, 200);
    }
    return utm;
  } catch {
    return {};
  }
}
