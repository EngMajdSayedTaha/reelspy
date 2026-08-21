"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Laptop, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PassphraseFields, passphrasePairReady, type PassphrasePair } from "@/components/admin/security/PassphraseFields";
import { requestJson, notifyError } from "@/lib/utils/api";

// /admin/security — the two things an admin needs when something feels wrong:
// change the passphrase, and see (and end) every device currently holding
// elevation.

type SessionRow = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  reauthAt: string;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
};

// "Chrome on macOS" out of a user-agent string — enough to recognise your own
// devices in a list, without pretending to be device fingerprinting.
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : "Browser";
  const os =
    /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Windows/.test(userAgent) ? "Windows"
    : /Linux/.test(userAgent) ? "Linux"
    : "";
  return os ? `${browser} on ${os}` : browser;
}

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

function formatUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.round((diff % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function SecurityPanel({ email, idleMinutes }: { email: string | null; idleMinutes: number }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [current, setCurrent] = useState("");
  const [pair, setPair] = useState<PassphrasePair>({ value: "", confirm: "" });
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await requestJson<{ sessions: SessionRow[] }>("/api/admin/security/sessions");
      setSessions(data.sessions);
    } catch (err) {
      notifyError(err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const rotate = async () => {
    if (rotating) return;
    setRotating(true);
    try {
      const result = await requestJson<{ sessionsRevoked: number }>("/api/admin/security/passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, passphrase: pair.value }),
      });
      toast.success(
        result.sessionsRevoked > 0
          ? `Passphrase changed. ${result.sessionsRevoked} other session${result.sessionsRevoked === 1 ? "" : "s"} signed out.`
          : "Passphrase changed."
      );
      setCurrent("");
      setPair({ value: "", confirm: "" });
      void load();
    } catch (err) {
      notifyError(err);
    } finally {
      setRotating(false);
    }
  };

  const revoke = async (payload: { id: string } | { all: true }, self: boolean) => {
    try {
      await requestJson("/api/admin/security/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (self) {
        toast.success("Panel locked.");
        router.replace("/admin/unlock");
        router.refresh();
        return;
      }
      toast.success("Session ended.");
      void load();
    } catch (err) {
      notifyError(err);
    }
  };

  const canRotate = current.length > 0 && passphrasePairReady(pair, email) && !rotating;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Change the admin passphrase
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Every other unlocked session is signed out of the panel immediately — this device stays in.
          Do it the moment you suspect anyone else has seen the passphrase.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void rotate();
          }}
          className="flex max-w-md flex-col gap-3"
        >
          <Input
            type="password"
            autoComplete="off"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            placeholder="Current admin passphrase"
            aria-label="Current admin passphrase"
            className="h-11"
          />
          <PassphraseFields pair={pair} onChange={setPair} email={email} disabled={rotating} />
          <Button type="submit" disabled={!canRotate}>
            <KeyRound className="h-4 w-4" />
            {rotating ? "Changing…" : "Change passphrase"}
          </Button>
        </form>
      </section>

      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Unlocked sessions
          </h2>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Devices that can act as an admin right now. Each one also locks itself after{" "}
          {idleMinutes} minutes of inactivity.
        </p>

        {sessions === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unlocked sessions.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/40 p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Laptop className="h-4 w-4 text-muted-foreground" />
                    {describeDevice(session.userAgent)}
                    {session.current ? (
                      <span className="rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                        This device
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {session.ip ?? "unknown IP"} · unlocked {formatWhen(session.createdAt)} · active{" "}
                    {formatWhen(session.lastSeenAt)} · re-locks in {formatUntil(session.expiresAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void revoke({ id: session.id }, session.current)}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {session.current ? "Lock this device" : "End session"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {sessions && sessions.length > 1 ? (
          <Button
            variant="destructive"
            size="sm"
            className="mt-4"
            onClick={() => void revoke({ all: true }, true)}
          >
            <LogOut className="h-3.5 w-3.5" />
            End every session, including this one
          </Button>
        ) : null}
      </section>
    </div>
  );
}
