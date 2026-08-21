"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, requestJson, setApiChallengeHandler, type ChallengeCode } from "@/lib/utils/api";

// The one place the admin panel asks for the passphrase mid-flight.
//
// Mounted once by AdminShell. When any admin request comes back with
// `elevation_required` (the panel re-locked — idle timeout, absolute expiry, a
// revoked session) or `reauth_required` (a critical action wants the passphrase
// again), lib/utils/api.ts hands the challenge here, this dialog collects the
// passphrase, and the original request is replayed. The admin keeps their page,
// their form state and their place in the queue.
//
// Cancelling resolves the challenge as unsatisfied: the original call then
// throws its 403 like any other error and the caller's own error handling
// takes over. Nothing is retried behind the admin's back.

type Pending = {
  code: ChallengeCode;
  action: string | null;
  resolve: (satisfied: boolean) => void;
};

export function ReauthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Survives re-renders so a challenge that arrives while one is open can be
  // answered by the same entry instead of stacking dialogs.
  const openRef = useRef<Pending | null>(null);

  useEffect(() => {
    return setApiChallengeHandler((code, action) => {
      // A second challenge while the dialog is open (two requests in flight)
      // waits on the same answer rather than fighting for the input.
      if (openRef.current) {
        const first = openRef.current;
        return new Promise<boolean>((resolve) => {
          const previous = first.resolve;
          first.resolve = (satisfied) => {
            previous(satisfied);
            resolve(satisfied);
          };
        });
      }
      return new Promise<boolean>((resolve) => {
        const entry: Pending = { code, action, resolve };
        openRef.current = entry;
        setPassphrase("");
        setError(null);
        setPending(entry);
      });
    });
  }, []);

  const finish = useCallback((satisfied: boolean) => {
    const entry = openRef.current;
    openRef.current = null;
    setPending(null);
    setPassphrase("");
    setError(null);
    setBusy(false);
    entry?.resolve(satisfied);
  }, []);

  const submit = async () => {
    if (!passphrase || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson("/api/admin/security/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      finish(true);
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { code?: string } | null) : null;
      if (body?.code === "not_enrolled") {
        finish(false);
        router.push("/admin/setup");
        return;
      }
      setError(err instanceof Error ? err.message : "That didn't work.");
      setPassphrase("");
      setBusy(false);
    }
  };

  return (
    <>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <DialogContent
          // Above the confirm/alert dialogs (z-50) that a destructive action
          // may already have open when the challenge fires — otherwise the
          // prompt renders behind the thing that triggered it.
          className="z-[60]"
          title={pending?.code === "reauth_required" ? "Confirm it's you" : "The admin panel re-locked"}
          description={
            pending?.code === "reauth_required"
              ? `Enter your admin passphrase to ${pending?.action ?? "continue"}. This is asked again for the few actions that can't be undone.`
              : "Your elevated session ended. Enter your admin passphrase to pick up where you left off."
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This is your admin passphrase — not your account password. Nothing is submitted until
                you confirm.
              </span>
            </div>

            <Input
              type="password"
              autoFocus
              autoComplete="off"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Admin passphrase"
              aria-label="Admin passphrase"
              aria-invalid={error ? true : undefined}
              className="h-10"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => finish(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={!passphrase || busy}>
                <Lock className="h-4 w-4" />
                {busy ? "Checking…" : "Confirm"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
