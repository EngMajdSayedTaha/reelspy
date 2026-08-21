"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, requestJson } from "@/lib/utils/api";

type SessionStatus = {
  enrollment: "enrolled" | "invited" | "none";
  elevated: boolean;
  lockedForSeconds: number;
};

type UnlockError = {
  code?: string;
  remainingAttempts?: number;
  retryAfterSeconds?: number;
};

function formatWait(seconds: number): string {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} min`;
  return `${seconds}s`;
}

/**
 * The door to the control panel: exchange the admin passphrase for an elevated
 * session (lib/admin/elevation.ts).
 *
 * On mount it asks the server where it stands, for two reasons. The elevation
 * cookie is SameSite=Strict, so arriving from an off-site link (an alert email,
 * a chat message) sends the browser here WITHOUT it even though the elevation
 * is perfectly alive — this same-origin fetch carries it, so that case becomes
 * a redirect instead of a pointless re-prompt. And if no passphrase has ever
 * been set, there is nothing to type: the admin belongs on /admin/setup.
 */
export function UnlockForm({ next }: { next: string }) {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [lockedFor, setLockedFor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await requestJson<SessionStatus>("/api/admin/security/session");
        if (cancelled) return;
        if (status.elevated) {
          router.replace(next);
          return;
        }
        if (status.enrollment === "none" || status.enrollment === "invited") {
          router.replace("/admin/setup");
          return;
        }
        setLockedFor(status.lockedForSeconds);
      } catch {
        // The form still works; the probe is an optimization, not a gate.
      } finally {
        if (!cancelled) {
          setChecking(false);
          inputRef.current?.focus();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  // Live countdown while locked out, so the admin isn't reloading to find out.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setInterval(() => setLockedFor((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [lockedFor]);

  const submit = async () => {
    if (!passphrase || busy) return;
    setBusy(true);
    setError(null);
    setDetail(null);
    try {
      await requestJson("/api/admin/security/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      setPassphrase("");
      router.replace(next);
      router.refresh();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as UnlockError | null) : null;
      if (body?.code === "not_enrolled") {
        router.replace("/admin/setup");
        return;
      }
      if (body?.retryAfterSeconds) setLockedFor(body.retryAfterSeconds);
      setError(err instanceof Error ? err.message : "That didn't work.");
      setDetail(
        typeof body?.remainingAttempts === "number" && body.remainingAttempts > 0
          ? `${body.remainingAttempts} attempt${body.remainingAttempts === 1 ? "" : "s"} left before the panel locks.`
          : null
      );
      setPassphrase("");
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const locked = lockedFor > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3"
    >
      <Input
        ref={inputRef}
        type="password"
        autoComplete="off"
        autoFocus
        disabled={checking || locked}
        value={passphrase}
        onChange={(event) => setPassphrase(event.target.value)}
        placeholder="Admin passphrase"
        aria-label="Admin passphrase"
        aria-invalid={error ? true : undefined}
        className="h-11"
      />

      {locked ? (
        <p className="text-sm text-destructive">
          Locked after too many wrong attempts. Try again in {formatWait(lockedFor)}.
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      {detail && !locked ? <p className="text-xs text-muted-foreground">{detail}</p> : null}

      <Button type="submit" size="lg" disabled={!passphrase || busy || checking || locked}>
        <KeyRound className="h-4 w-4" />
        {busy ? "Unlocking…" : "Unlock the panel"}
      </Button>

      <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Forgot it? It cannot be recovered or emailed — mint a new enrollment code with{" "}
          <code className="rounded bg-secondary px-1 py-0.5">npm run admin:passphrase -- invite</code>{" "}
          from a machine that has the service-role key, then set a new one at /admin/setup.
        </span>
      </p>
    </form>
  );
}
