"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PassphraseFields, passphrasePairReady, type PassphrasePair } from "@/components/admin/security/PassphraseFields";
import { ApiError, requestJson } from "@/lib/utils/api";

/**
 * First-time enrollment (and the way back from a forgotten passphrase): redeem
 * a one-time code minted by `npm run admin:passphrase -- invite`, then choose
 * the passphrase.
 *
 * The code is the whole point. Setting the first passphrase from inside a
 * signed-in browser session would mean a stolen session could set it too — and
 * then the second factor is just the first factor wearing a hat. Minting
 * requires the Supabase service-role key, so enrolling proves access to the
 * infrastructure, not merely to a logged-in tab.
 */
export function SetupForm({ email, invited }: { email: string | null; invited: boolean }) {
  const router = useRouter();
  const [ticket, setTicket] = useState("");
  const [pair, setPair] = useState<PassphrasePair>({ value: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = ticket.trim().length > 0 && passphrasePairReady(pair, email);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson("/api/admin/security/passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: ticket.trim(), passphrase: pair.value }),
      });
      // The response set a fresh elevation cookie, so the panel is open.
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { problems?: string[] } | null) : null;
      setError(body?.problems?.[0] ?? (err instanceof Error ? err.message : "That didn't work."));
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
    >
      {!invited ? (
        <div className="flex flex-col gap-2 rounded-xl bg-secondary/60 p-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Terminal className="h-4 w-4" />
            No enrollment code is pending
          </p>
          <p>
            Run this where the Supabase service-role key is available (your laptop, with{" "}
            <code className="rounded bg-background px-1 py-0.5">.env.local</code>):
          </p>
          <code className="block overflow-x-auto rounded-lg bg-background p-3 text-xs">
            npm run admin:passphrase -- invite --email {email ?? "you@example.com"}
          </code>
          <p>It prints a one-time code, valid for 30 minutes. Paste it below.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="enrollment-code" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Enrollment code
        </label>
        <Input
          id="enrollment-code"
          value={ticket}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setTicket(event.target.value)}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          className="h-11 font-mono tracking-widest"
        />
      </div>

      <PassphraseFields pair={pair} onChange={setPair} email={email} disabled={busy} />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" size="lg" disabled={!ready || busy}>
        <ShieldCheck className="h-4 w-4" />
        {busy ? "Setting…" : "Set the admin passphrase"}
      </Button>
    </form>
  );
}
